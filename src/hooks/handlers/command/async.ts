import type { CommandRun, CommandRunner } from '../../../ports/index.ts';
import type { BackgroundResult, ForegroundRun } from '../context.ts';

/**
 * Background command hooks (hooks.md, "Run hooks in the background" and "Command hook fields").
 * `async: true` "runs in the background without blocking"; `asyncRewake: true` "runs in the
 * background and wakes Claude on exit code 2", and "implies async" (the SDK type). The timeout is
 * not enforced on an `async` hook but is on an `asyncRewake` one: that is decided where the
 * limit is computed (`handlerTimeoutMs`), so the request here already carries it or not.
 */

export type RunMode = 'foreground' | 'async' | 'rewake';

interface Mode {
  /** The engine does not wait for the process. */
  readonly background: boolean;
  /** An exit with code 2 wakes Claude. */
  readonly wakes: boolean;
}

export const MODES: { readonly [M in RunMode]: Mode } = {
  foreground: { background: false, wakes: false },
  async: { background: true, wakes: false },
  rewake: { background: true, wakes: true },
};

export const modeOf = (handler: {
  readonly async?: boolean;
  readonly asyncRewake?: boolean;
}): RunMode =>
  handler.asyncRewake === true ? 'rewake' : handler.async === true ? 'async' : 'foreground';

const WAKE_EXIT_CODE = 2;

/**
 * "The hook's stderr, or stdout if stderr is empty, is shown to Claude as a system reminder."
 * Judgment (spec/judgments.md): stderr of only whitespace is empty, and when the text that is left
 * is blank too there is nothing to say, so Claude is not woken.
 */
function wakeMessage(run: ForegroundRun): string | undefined {
  if (!('exitCode' in run) || run.exitCode !== WAKE_EXIT_CODE) return undefined;
  const text = run.stderr.trim() === '' ? run.stdout : run.stderr;
  return text.trim() === '' ? undefined : text;
}

/** The port's answer as the run the interpreter reads. */
export async function settle(runner: CommandRunner, request: CommandRun): Promise<ForegroundRun> {
  const result = await runner.run(request);
  if (result.startError !== undefined) return { kind: 'not-started', message: result.startError };
  if (result.timedOut) return { kind: 'timed-out' };
  if (result.exitCode === null) return { kind: 'cancelled' };
  return {
    kind: 'exited',
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Starts the process and returns at once; `done` settles when it ends. */
export function startInBackground(
  runner: CommandRunner,
  request: CommandRun,
  mode: Mode,
): { readonly kind: 'background'; readonly done: Promise<BackgroundResult> } {
  const done = settle(runner, request).then((run): BackgroundResult => {
    const wake = mode.wakes ? wakeMessage(run) : undefined;
    return wake === undefined ? { run } : { run, wake };
  });
  return { kind: 'background', done };
}
