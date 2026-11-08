import type { SkillShell } from '../format/skill-types.ts';
import { splitCommand, stripWrappers } from '../rules/index.ts';

/**
 * Whether exit code 1 of an injected command is a result and not a failure (skills.md, "When an
 * injected command fails": "Claude Code treats exit code 1 from search and comparison commands as
 * a normal result ... Exit codes of 2 or higher fail even for those commands"). The commands are
 * the ones tools-reference.md names, per shell.
 */

/** The one-word and two-word command names, per shell (tools-reference.md, "Output limits"). */
const BENIGN_EXIT_ONE: { readonly [S in SkillShell]: ReadonlySet<string> } = {
  // "grep, rg, egrep, fgrep, find, diff, test, and [, plus git diff and git grep"
  bash: new Set([
    'grep',
    'rg',
    'egrep',
    'fgrep',
    'find',
    'diff',
    'test',
    '[',
    'git diff',
    'git grep',
  ]),
  // "grep, rg, egrep, fgrep, findstr, git grep, and git diff" (not find or diff)
  powershell: new Set(['grep', 'rg', 'egrep', 'fgrep', 'findstr', 'git grep', 'git diff']),
};

const WHITESPACE = /\s+/;

/**
 * The command a line's exit status is that of: its last simple command, past wrappers
 * (`timeout 5 grep x`) and assignments (`FOO=1 grep x`). Judgment (spec/judgments.md): the docs say
 * "for that command" and not how a pipeline or a list counts.
 */
function lastCommand(commandLine: string): string {
  const last = splitCommand(commandLine).subcommands.at(-1) ?? commandLine;
  return stripWrappers(last, 'deny').trim();
}

/** `git diff` and `git grep` are two words; every other name is one. */
function nameOf(command: string): readonly string[] {
  const [first = '', second = ''] = command.split(WHITESPACE);
  return first === 'git' ? [`git ${second}`] : [first];
}

/** Whether `exitCode` of `commandLine` is a normal result in `shell`. */
export function isNormalResult(
  commandLine: string,
  shell: SkillShell,
  exitCode: number | null,
): boolean {
  if (exitCode === 0) return true;
  if (exitCode !== 1) return false;
  const names = BENIGN_EXIT_ONE[shell];
  return nameOf(lastCommand(commandLine)).some((name) => names.has(name));
}
