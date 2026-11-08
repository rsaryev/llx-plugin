import type { CommandResult, CommandRun, CommandRunner } from '../../ports/index.ts';

/** What one scripted run answers: a result with defaults (exit 0, no output), or a function of the run. */
export type RunnerReply = Partial<CommandResult> | ((run: CommandRun) => Partial<CommandResult>);

/**
 * A `CommandRunner` that answers from a script, in order, and records every run in `calls`. It
 * runs nothing. When the script is spent the test is wrong, so it throws rather than guess.
 */
export function scriptedRunner(
  ...replies: readonly RunnerReply[]
): CommandRunner & { readonly calls: CommandRun[] } {
  const calls: CommandRun[] = [];
  return {
    calls,
    run: (run) => {
      const index = calls.length;
      calls.push(run);
      const reply = replies[index];
      if (reply === undefined) {
        return Promise.reject(new Error(`scriptedRunner: no reply for run ${index + 1}`));
      }
      const given = typeof reply === 'function' ? reply(run) : reply;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', timedOut: false, ...given });
    },
  };
}
