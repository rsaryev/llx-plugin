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
import type { DispatchRequest, HookOutcome } from './outcome.ts';
import type { selectHandlers } from './select/select.ts';
import type { IfEvaluator } from './select/if-guard.ts';
import { interpretRun } from './verdict/interpret.ts';
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
  readonly startDirectory?: string;
  readonly tempDirectory?: string;
  readonly userConfigOf?: RunContext['userConfigOf'];
  readonly httpPolicy?: RunContext['httpPolicy'];
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
    windows: config.windows,
    defaultShell: config.defaultShell,
    timeouts,
    signal: request.signal,
    ...(config.startDirectory === undefined ? {} : { startDirectory: config.startDirectory }),
    ...(config.tempDirectory === undefined ? {} : { tempDirectory: config.tempDirectory }),
    ...(config.userConfigOf === undefined ? {} : { userConfigOf: config.userConfigOf }),
    ...(config.httpPolicy === undefined ? {} : { httpPolicy: config.httpPolicy }),
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
    observer?.finished?.({ event, handlerId: verdict.handler.id, status: verdict.status });
    if (verdict.notice !== undefined) observer?.notice?.(verdict.notice);
  }
}

export async function dispatchEvent<E extends HookEvent>(
  registry: HookRegistry,
  request: DispatchRequest<E>,
  config: DispatchConfig,
): Promise<HookOutcome<E>> {
  const { event, facts, session } = request;
  const { stages } = config;
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
    return idleOutcome(event, issues);
  const { input } = built;
  const timeouts = planTimeouts(event, selection.selected, config.ports.environment);
  const ran = await runLimited(selection.selected, async (entry) => ({
    entry,
    result: await stages.run(
      entry,
      contextOf(config, request, timeouts, inputText(input, selection, entry)),
    ),
  }));
  const verdicts = ran.map(({ entry, result }) => ({
    ...interpretRun(entry, result.run, {
      event,
      facts,
      parse: stages.output.parse,
      timeoutMs: handlerTimeoutMs(entry, timeouts),
      effectsIgnored: selection.monitor.get(entry)?.effectsApply === false,
      gitBashMissing: config.windows && config.defaultShell === 'powershell',
    }),
    issues: result.issues,
  }));
  report(config.observer, event, verdicts);
  const merged = stages.output.merge(event, verdicts.map(tagged));
  return assemble(event, verdicts, merged, issues);
}
