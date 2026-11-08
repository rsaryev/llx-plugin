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

/**
 * tools-reference.md, "Exit code 1 from searches and `git diff` in PowerShell": "The PowerShell
 * tool can count exit code 1 as a normal result from `grep`, `rg`, `egrep`, `fgrep`, `findstr`,
 * `git grep`, and `git diff`."
 */
const BENIGN_EXIT_1_POWERSHELL: readonly (readonly string[])[] = [
  ['grep'],
  ['rg'],
  ['egrep'],
  ['fgrep'],
  ['findstr'],
  ['git', 'grep'],
  ['git', 'diff'],
];

/**
 * The simple command a line exits with: the last one, found as the subcommand that ends the text.
 * A `!` before it inverts the status, so the line is not read as that command (spec/judgments.md).
 */
function lastCommand(command: string): string | undefined {
  const text = command.trimEnd().replace(/[;\s]+$/, '');
  const found = splitCommand(text).subcommands.findLast((subcommand) => text.endsWith(subcommand));
  if (found === undefined) return undefined;
  const before = text.slice(0, text.length - found.length).trimEnd();
  return before.endsWith('!') ? undefined : found;
}

const beginsWith = (words: readonly string[], head: readonly string[]): boolean =>
  head.every((word, index) => words[index] === word);

function classify(
  benign: readonly (readonly string[])[],
  command: string,
  exitCode: number,
): boolean {
  if (exitCode === 0) return true;
  if (exitCode !== 1) return false;
  const last = lastCommand(command);
  if (last === undefined) return false;
  const words = wordsOf(last).map((word) => word.text);
  return benign.some((head) => beginsWith(words, head));
}

/**
 * Whether Claude Code counts the finished command as a valid result rather than a failure: exit 0
 * always, exit 1 only for the commands above, anything else never. A compound line exits with its
 * last command, and a command behind a wrapper, a variable assignment, a `!`, a subshell or a
 * trailing `&`, or with options before the subcommand (`sudo grep`, `git -C . diff`), is read as
 * written, so it is a failure (spec/judgments.md).
 */
export const classifyBashExit = (command: string, exitCode: number): boolean =>
  classify(BENIGN_EXIT_1, command, exitCode);

/**
 * The same for the PowerShell tool, whose benign list is its own (`findstr` in, `find`, `diff`,
 * `test` and `[` out). A line is split as a Bash line is (spec/judgments.md).
 */
export const classifyPowerShellExit = (command: string, exitCode: number): boolean =>
  classify(BENIGN_EXIT_1_POWERSHELL, command, exitCode);
