import { splitCommand } from '../../bash/split.ts';
import { wordsOf } from '../../bash/words.ts';
import type { Environment } from '../../../ports/environment.ts';

/** What the session is, as far as moving a timed-out command goes. */
export interface MoveSession {
  /** Running in bare mode (headless.md, "Start faster with bare mode"). */
  readonly bare: boolean;
}

/**
 * Whether a foreground command that reaches its timeout moves to the background instead of
 * stopping (tools-reference.md, "Foreground commands that move to the background"): it does, unless
 * the command starts with `sleep`, `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` is set (env-vars.md:
 * "Set to `1`") or the session runs in bare mode. A line "starts with `sleep`" when its first word
 * is `sleep` (spec/judgments.md).
 */
export function shouldMoveToBackground(
  command: string,
  env: Pick<Environment, 'get'>,
  session: MoveSession,
): boolean {
  if (session.bare || env.get('CLAUDE_CODE_DISABLE_BACKGROUND_TASKS')?.trim() === '1') return false;
  return wordsOf(command.trimStart()).at(0)?.text !== 'sleep';
}

/** "`Command did not complete within its 120s timeout and was moved to the background`", seconds of the timeout. */
export const movedByTimeoutNotice = (timeoutMs: number): string =>
  `Command did not complete within its ${timeoutMs / 1000}s timeout and was moved to the background`;

const DIRECTORY_COMMANDS = new Set(['cd', 'pushd', 'popd', 'chdir']);

/**
 * The note of a moved command that changes directory: "A `cd`, `pushd`, `popd`, or `chdir` inside a
 * command that is moved to the background never carries over: the result states `Session cwd
 * remains <dir>; directory changes made by the backgrounded command do not apply to subsequent
 * commands.`" `undefined` when no subcommand starts with one of the four.
 */
export function backgroundCwdNote(command: string, cwd: string): string | undefined {
  const changes = splitCommand(command).subcommands.some((subcommand) =>
    DIRECTORY_COMMANDS.has(wordsOf(subcommand).at(0)?.text ?? ''),
  );
  return changes
    ? `Session cwd remains ${cwd}; directory changes made by the backgrounded command do not apply to subsequent commands.`
    : undefined;
}

/** "`Background command "<description>" was stopped after reaching its background time limit`". */
export const backgroundStopNotice = (description: string): string =>
  `Background command "${description}" was stopped after reaching its background time limit`;
