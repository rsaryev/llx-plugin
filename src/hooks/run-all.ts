import type { HookEvent } from '../protocol/official.ts';
import type { RegisteredHandler, Selection } from './contracts.ts';
import type { DispatchConfig } from './dispatch.ts';
import type { HandlerResult, RunContext } from './handlers/context.ts';
import { runLimited } from './handlers/remote/concurrency.ts';
import { handlerTimeoutMs, planTimeouts } from './handlers/timeouts.ts';
import { serializeHookInput } from './input/build.ts';
import type { InterruptPlan } from './interrupt.ts';
import type { DispatchRequest } from './outcome.ts';
import { limitDelivery } from './output/limit.ts';
import { interpretRun } from './verdict/interpret.ts';
import type { HandlerVerdict } from './verdict/types.ts';

/**
 * The run stage of one dispatch: every selected handler runs through the run port and is read. A
 * run never rejects the dispatch: a port that throws is a hook that could not start, read through
 * the failure table like any other, so a sibling hook's block still holds. A `once` handler's hold
 * ends with its run (its process, for a background one), and a background delivery gets the cap
 * and escape of the foreground text.
 */

export interface Planned {
  readonly selection: Selection;
  readonly plan: InterruptPlan;
  readonly input: Parameters<typeof serializeHookInput>[0];
}

/** The input text of each handler, serialized once: a Monitor call that reached a `Bash` matcher is a Bash call. */
function inputTexts(
  input: Planned['input'],
  selection: Selection,
): (entry: RegisteredHandler) => string {
  const text = serializeHookInput(input);
  const asBash =
    selection.monitor.size === 0 ? text : JSON.stringify({ ...input, tool_name: 'Bash' });
  return (entry) => (selection.monitor.get(entry)?.asBash === true ? asBash : text);
}

/** What the host set for its command hooks: their paths, folders and environment. */
function commandOptionsOf(config: DispatchConfig): Partial<RunContext> {
  return {
    ...(config.startDirectory === undefined ? {} : { startDirectory: config.startDirectory }),
    ...(config.tempDirectory === undefined ? {} : { tempDirectory: config.tempDirectory }),
    ...(config.processId === undefined ? {} : { processId: config.processId }),
    ...(config.settingsEnv === undefined ? {} : { settingsEnv: config.settingsEnv }),
  };
}

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

const CANCELLED: HandlerResult = { run: { kind: 'cancelled' }, issues: [] };

const messageOf = (thrown: unknown): string =>
  thrown instanceof Error ? thrown.message : String(thrown);

/**
 * One handler's run. "you cancel the hooks at once": a hook not started when the signal fired (one
 * waiting for a slot among the prompt and agent hooks) does not start. A run port that throws is a
 * hook that could not run (judgment, spec/judgments.md).
 */
async function runGuarded(
  config: DispatchConfig,
  entry: RegisteredHandler,
  context: RunContext,
): Promise<HandlerResult> {
  if (context.signal.aborted) return CANCELLED;
  try {
    return await config.stages.run(entry, context);
  } catch (thrown) {
    return {
      run: { kind: 'not-started', message: `Hook could not run: ${messageOf(thrown)}` },
      issues: [],
    };
  }
}

/**
 * Ends the `once` hold of each run and caps what a background run delivers. A foreground run
 * settles now, a background one when its process ends: hooks.md, "Common fields", consumes a
 * skill's `once` hook "after its first successful run", async completion included.
 */
function settled(
  request: Pick<DispatchRequest<HookEvent>, 'event' | 'signal'>,
  config: DispatchConfig,
  verdict: HandlerVerdict,
): HandlerVerdict {
  const { onceClaims: claims } = config;
  const { delivery, handler } = verdict;
  if (delivery === undefined) {
    claims?.settle(handler, verdict.succeeded);
    return verdict;
  }
  const limit = {
    signal: request.signal,
    ...(config.scratch === undefined ? {} : { scratch: config.scratch }),
  };
  return {
    ...verdict,
    delivery: delivery.then(
      (done) => {
        claims?.settle(handler, done.exitCode === 0);
        return limitDelivery(request.event, done, limit);
      },
      (thrown: unknown) => {
        claims?.settle(handler, false);
        throw thrown;
      },
    ),
  };
}

export async function runAll<E extends HookEvent>(
  request: DispatchRequest<E>,
  config: DispatchConfig,
  { selection, plan, input }: Planned,
): Promise<readonly HandlerVerdict[]> {
  const { event } = request;
  const timeouts = planTimeouts(event, selection.selected, config.ports.environment, plan.capMs);
  const textOf = inputTexts(input, selection);
  const ran = await runLimited(selection.selected, async (entry) => ({
    entry,
    result: plan.cancel
      ? CANCELLED
      : await runGuarded(config, entry, contextOf(config, request, timeouts, textOf(entry))),
  }));
  return ran.map(({ entry, result }) =>
    settled(request, config, {
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
    }),
  );
}
