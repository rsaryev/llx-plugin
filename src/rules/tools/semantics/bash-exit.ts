import { splitCommand, wordsOf } from '../../bash/split.ts';

/**
 * tools-reference.md, "Output limits": "A command that exits 1 counts as a valid result for the
 * Bash tool only when Claude Code recognizes exit code 1 as a benign outcome for that command:
 * `grep`, `rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, and `[`, plus `git diff` and `git grep`."
 * Each entry is the command's leading words.
 */
const BENIGN_EXIT_1: readonly (readonly string[])[] = [
  ['grep'],
  ['rg'],
  ['egrep'],
  ['fgrep'],
  ['find'],
  ['diff'],
  ['test'],
  ['['],
  ['git', 'diff'],
  ['git', 'grep'],
];

/** The simple command a line exits with: the last one, found as the subcommand that ends the text. */
function lastCommand(command: string): string | undefined {
  const text = command.trimEnd().replace(/[;\s]+$/, '');
  return splitCommand(text).subcommands.findLast((found) => text.endsWith(found));
}

const beginsWith = (words: readonly string[], head: readonly string[]): boolean =>
  head.every((word, index) => words[index] === word);

/**
 * Whether Claude Code counts the finished command as a valid result rather than a failure: exit 0
 * always, exit 1 only for the commands above, anything else never. A compound line exits with its
 * last command, and a command behind a wrapper or with options before the subcommand (`sudo grep`,
 * `git -C . diff`) is read as written, so it is a failure (spec/judgments.md).
 */
export function classifyBashExit(command: string, exitCode: number): boolean {
  if (exitCode === 0) return true;
  if (exitCode !== 1) return false;
  const last = lastCommand(command);
  if (last === undefined) return false;
  const words = wordsOf(last).map((word) => word.text);
  return BENIGN_EXIT_1.some((head) => beginsWith(words, head));
}
