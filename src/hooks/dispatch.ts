import { type PluginIssue } from '../format/issues.ts';
import type { ShellKind } from '../ports/index.ts';
import type { HookEvent } from '../protocol/official.ts';
import { assemble, idleOutcome } from './assemble.ts';
import type { HookRegistry, ModelCatalog, RegisteredHandler, Selection } from './contracts.ts';
import type { HandlerResult, RunContext, RunPorts } from './handlers/context.ts';
import { handlerTimeoutMs, planTimeouts } from './handlers/timeouts.ts';
import { runLimited } from './handlers/remote/concurrency.ts';
import { serializeHookInput } from './input/build.ts';
import type { buildHookInput } from './input/build.ts';
import type { EnvFiles } from './env-file/index.ts';
import type { DispatchRequest, HookOutcome } from './outcome.ts';
import type { selectHandlers } from './select/select.ts';
import type { IfEvaluator } from './select/if-guard.ts';
import { interruptPlan, withInterrupt, type InterruptPlan } from './interrupt.ts';
import { withOriginalPrompt } from './verdict/blocked-prompt.ts';
import { interpretRun } from './verdict/interpret.ts';
import { isToolCall, type StopBlockCap } from './verdict/stop-block-cap.ts';
import type { HandlerVerdict, HookObserver, OutputStage, TaggedOutput } from './verdict/types.ts';

/**
 * One dispatch: select the handlers, build the input, run them through the ports, read each run,
 * merge the outputs. The stages are the ones of `contracts.ts`, passed in so each is tested alone
 * and the engine wires the real ones.
 */

export interface DispatchStages {
  readonly select: typeof selectHandlers;
  readonly build: typeof buildHookInput;
  readonly run: (entry: RegisteredHandler, context: RunContext) => Promise<HandlerResult>;
  readonly output: OutputStage;
}

/** What the host fixes once: its ports and the facts about the machine the kit cannot know (L3). */
export interface DispatchConfig {
  readonly stages: DispatchStages;
  readonly ports: RunPorts;
  readonly observer?: HookObserver;
  readonly ifEvaluator?: IfEvaluator;
  readonly modelCatalog?: ModelCatalog;
  readonly windows: boolean;
  readonly defaultShell: ShellKind;
  readonly shellPaths?: RunContext['shellPaths'];
  readonly startDirectory?: string;
  readonly tempDirectory?: string;
  readonly userConfigOf?: RunContext['userConfigOf'];
  readonly httpPolicy?: RunContext['httpPolicy'];
  /** The host process's id: `CLAUDE_PID` in every command hook. */
  readonly processId?: number;
  /** The `env` of the settings files (`resolveSettingsEnv`), written over the host's environment for every hook. */
  readonly settingsEnv?: RunContext['settingsEnv'];
  /** `CLAUDE_ENV_FILE`: the files, and the clearing a `CwdChanged` event does. */
  readonly envFiles?: EnvFiles;
  /** Plugin command hooks first check that their plugin's directory exists (`checkPluginDirectory`). */
  readonly checkPluginDirectories?: boolean;
  /** The counter of consecutive Stop blocks (`createStopBlockCap`); without it no cap applies. */
  readonly stopCap?: StopBlockCap;
}

/** The input text of one handler: a Monitor call that reached a `Bash` matcher is a Bash call. */
const inputText = (
  input: Parameters<typeof serializeHookInput>[0],
  selection: Selection,
  entry: RegisteredHandler,
): string =>
  selection.monitor.get(entry)?.asBash === true
    ? JSON.stringify({ ...input, tool_name: 'Bash' })
    : serializeHookInput(input);

function contextOf(
  config: DispatchConfig,
  request: Pick<DispatchRequest<HookEvent>, 'session' | 'signal'>,
  timeouts: RunContext['timeouts'],
  input: string,
): RunContext {
  return {
    ports: config.ports,
    input,
    cwd: request.session.cwd,
    sessionId: request.session.sessionId,
    windows: config.windows,
    defaultShell: config.defaultShell,
    timeouts,
    signal: request.signal,
    ...(request.session.effort === undefined ? {} : { effort: request.session.effort.level }),
    ...commandOptionsOf(config),
    ...(config.userConfigOf === undefined ? {} : { userConfigOf: config.userConfigOf }),
    ...(config.httpPolicy === undefined ? {} : { httpPolicy: config.httpPolicy }),
    ...(config.envFiles === undefined ? {} : { envFiles: config.envFiles }),
    ...(config.checkPluginDirectories === true ? { checkPluginDirectory: true } : {}),
  };
}

/** What the host set for its command hooks: their paths, folders and environment. */
function commandOptionsOf(config: DispatchConfig): Partial<RunContext> {
  return {
    ...(config.shellPaths === undefined ? {} : { shellPaths: config.shellPaths }),
    ...(config.startDirectory === undefined ? {} : { startDirectory: config.startDirectory }),
    ...(config.tempDirectory === undefined ? {} : { tempDirectory: config.tempDirectory }),
    ...(config.processId === undefined ? {} : { processId: config.processId }),
    ...(config.settingsEnv === undefined ? {} : { settingsEnv: config.settingsEnv }),
  };
}

const tagged = (verdict: HandlerVerdict): TaggedOutput => ({
  handler: verdict.handler,
  ...(verdict.output === undefined ? {} : { output: verdict.output }),
  ...(verdict.plainText === undefined ? {} : { plainText: verdict.plainText }),
  ...(verdict.effectsIgnored === true ? { effectsIgnored: true } : {}),
});

function report(
  observer: HookObserver | undefined,
  event: HookEvent,
  verdicts: readonly HandlerVerdict[],
) {
  for (const verdict of verdicts) {
    observer?.finished?.({
      event,
      handlerId: verdict.handler.id,
      status: verdict.status,
      ...(verdict.exitCode === undefined ? {} : { exitCode: verdict.exitCode }),
    });
    if (verdict.notice !== undefined) observer?.notice?.(verdict.notice);
  }
}

/** "you cancel the hooks at once": the hooks of an interrupted event do not run. */
const cancelledRuns = (selected: readonly RegisteredHandler[]) =>
  selected.map((entry) => ({
    entry,
    result: { run: { kind: 'cancelled' }, issues: [] } satisfies HandlerResult,
  }));

/**
 * "Claude Code writes the sequence only in an interactive session ... In non-interactive mode with
 * the `-p` flag and in the Agent SDK, it ignores the field" (hooks.md, "Emit terminal
 * notifications"). Whether the interface is on screen at that moment is the host's.
 */
const withTerminal = <E extends HookEvent>(
  outcome: HookOutcome<E>,
  session: DispatchRequest<E>['session'],
): HookOutcome<E> =>
  session.interactive || outcome.terminalSequences.length === 0
    ? outcome
    : { ...outcome, terminalSequences: [] };

/**
 * "When the `TaskUpdate` tool triggered the event, Claude Code ignores `continue: false`" (hooks.md,
 * "TaskCompleted decision control"); when a teammate's finished turn did, it stops the teammate. With
 * the trigger known the outcome says which; without it `effects.stopCondition` is left to the host.
 */
function withTaskTrigger<E extends HookEvent>(
  outcome: HookOutcome<E>,
  request: DispatchRequest<E>,
): HookOutcome<E> {
  const { taskCompletedBy } = request;
  if (taskCompletedBy === undefined || outcome.effects.stopCondition === undefined) return outcome;
  const { stopCondition: _decided, ...effects } = outcome.effects;
  if (taskCompletedBy === 'teammate-turn') return { ...outcome, effects };
  const { stopReason: _ignored, ...rest } = outcome;
  return { ...rest, continue: true, effects };
}

/** What the interrupt, the prompt and the Stop cap leave of an outcome (hooks.md, "Hook lifecycle"). */
function finished<E extends HookEvent>(
  outcomeOfRun: HookOutcome<E>,
  request: DispatchRequest<E>,
  config: DispatchConfig,
): HookOutcome<E> {
  const outcome = withTaskTrigger(withTerminal(outcomeOfRun, request.session), request);
  const quoted = withOriginalPrompt(outcome, request.facts);
  const interrupted = withInterrupt(quoted, request.signal.aborted);
  const where = { sessionId: request.session.sessionId, facts: request.facts };
  return config.stopCap?.apply(interrupted, where, config.ports.environment) ?? interrupted;
}

/** A dispatch with nothing to run holds nothing back: a Stop like that ends the run of blocks. */
function finishedIdle<E extends HookEvent>(
  outcome: HookOutcome<E>,
  request: DispatchRequest<E>,
  config: DispatchConfig,
): HookOutcome<E> {
  const where = { sessionId: request.session.sessionId, facts: request.facts };
  return config.stopCap?.apply(outcome, where, config.ports.environment) ?? outcome;
}

interface Planned {
  readonly selection: Selection;
  readonly plan: InterruptPlan;
  readonly input: Parameters<typeof serializeHookInput>[0];
}

async function runAll<E extends HookEvent>(
  request: DispatchRequest<E>,
  config: DispatchConfig,
  { selection, plan, input }: Planned,
) {
  const { event } = request;
  const { environment } = config.ports;
  const timeouts = planTimeouts(event, selection.selected, environment, plan.capMs);
  const ran = plan.cancel
    ? cancelledRuns(selection.selected)
    : await runLimited(selection.selected, async (entry) => ({
        entry,
        result: await config.stages.run(
          entry,
          contextOf(config, request, timeouts, inputText(input, selection, entry)),
        ),
      }));
  return ran.map(({ entry, result }) => ({
    ...interpretRun(entry, result.run, {
      event,
      facts: request.facts,
      parse: config.stages.output.parse,
      timeoutMs: handlerTimeoutMs(entry, timeouts),
      effectsIgnored: selection.monitor.get(entry)?.effectsApply === false,
      gitBashMissing: config.windows && config.defaultShell === 'powershell',
      teammateStopped: request.taskCompletedBy === 'teammate-turn',
    }),
    issues: result.issues,
  }));
}

export async function dispatchEvent<E extends HookEvent>(
  registry: HookRegistry,
  request: DispatchRequest<E>,
  config: DispatchConfig,
): Promise<HookOutcome<E>> {
  const { event, facts, session } = request;
  const { stages } = config;
  // "The count of consecutive continuations resets each time Claude calls a tool": hook or no hook.
  if (isToolCall(event)) config.stopCap?.reset(session.sessionId, session.agent?.id);
  // "until the next CwdChanged event, when Claude Code clears them": whether or not a hook is there.
  await config.envFiles?.beforeEvent(event, request.signal);
  const selection = stages.select(registry, {
    event,
    facts,
    session,
    ...(config.ifEvaluator === undefined ? {} : { ifEvaluator: config.ifEvaluator }),
    ...(config.modelCatalog === undefined ? {} : { modelCatalog: config.modelCatalog }),
  });
  const built = stages.build(event, facts, session);
  const issues: readonly PluginIssue[] = [...selection.issues, ...built.issues];
  if (built.input === undefined || selection.selected.length === 0)
    return finishedIdle(idleOutcome(event, issues), request, config);
  const plan = interruptPlan(event, request.interrupt, config.ports.environment);
  const verdicts = await runAll(request, config, { selection, plan, input: built.input });
  report(config.observer, event, verdicts);
  const limited = await stages.output.limit(event, verdicts.map(tagged), request.signal);
  const merged = stages.output.merge(event, limited.outputs, facts);
  return finished(
    assemble(event, verdicts, merged, [...issues, ...limited.issues]),
    request,
    config,
  );
}
