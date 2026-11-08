import { stripWrappers } from './wrappers.ts';
import { wordsOf } from './split.ts';

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
 * through, whichever rule is asked.
 */
export function requiresPromptDespitePrefixRule(subcommand: string): boolean {
  const [program, ...rest] = wordsOf(stripWrappers(subcommand, 'deny'));
  if (program === undefined) return false;
  if (EXEC_WRAPPERS.has(program.text)) return true;
  return program.text === 'find' && rest.some((word) => FIND_ACTIONS.has(word.text));
}
