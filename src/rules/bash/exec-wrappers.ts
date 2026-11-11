import { readCommand, type ShellCommand } from './words.ts';
import { strippedWords } from './wrappers.ts';

/**
 * permissions.md ("Exec wrappers and `find` actions"): "A prefix rule like `Bash(watch *)` or
 * `Bash(find *)` can't auto-approve" the exec wrappers `watch`, `setsid`, `ionice` and `flock`,
 * nor `find` "with an action that runs commands, deletes files, or writes files, such as `-exec`,
 * `-delete`, `-rm`, or `-fprint`, or with `-files0-from`".
 */
const EXEC_WRAPPERS: ReadonlySet<string> = new Set(['watch', 'setsid', 'ionice', 'flock']);

/**
 * The four actions the docs name, then the others of the same classes ("runs commands, deletes
 * files, or writes files") that find has: `-execdir`, `-ok`, `-okdir`, `-fprint0`, `-fprintf` and
 * `-fls` (spec/judgments.md).
 */
const FIND_ACTIONS: ReadonlySet<string> = new Set([
  '-exec',
  '-delete',
  '-rm',
  '-fprint',
  '-files0-from',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint0',
  '-fprintf',
  '-fls',
]);

/**
 * Whether a prefix (wildcard) allow rule must not approve this command: an exec wrapper, or a
 * `find` with an action that runs, deletes or writes. Wrappers and assignments in front are seen
 * through, whichever rule is asked; quoting a name or an action changes neither (`"watch"` is
 * `watch`, src/rules/bash/unquote.ts).
 */
export function promptsDespitePrefixRule(command: ShellCommand): boolean {
  const [program, ...rest] = strippedWords(command, 'deny');
  if (program === undefined) return false;
  if (EXEC_WRAPPERS.has(program.value)) return true;
  return program.value === 'find' && rest.some((word) => FIND_ACTIONS.has(word.value));
}

/** `promptsDespitePrefixRule` for a subcommand's text. */
export const requiresPromptDespitePrefixRule = (subcommand: string): boolean =>
  promptsDespitePrefixRule(readCommand(subcommand));
