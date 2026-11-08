import { scanCommand, wordsOf } from '../bash/split.ts';
import { stripWrappers } from '../bash/wrappers.ts';
import { absolutePath, normalizeAbsolute, relativeWithin } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import { expandHome, posixOf } from './scope.ts';

/**
 * permission-modes.md, "Critical paths": an `rm` or `rmdir` whose target Claude Code "recognizes as a
 * critical path": the filesystem root, a top-level directory, the home directory, the working
 * directory and its parents, and (only as a glob under them) the additional working directories and
 * their parents. The table "Other targets that count as critical paths" adds the shell-variable
 * forms and command substitution. The docs say the check "can miss some commands": what it does not
 * recognize gets no special handling here either.
 */

const REMOVERS: ReadonlySet<string> = new Set(['rm', 'rmdir']);
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** "A shell variable followed by one common top-level directory name, such as `mnt`, `tmp`, `usr`, or `Users`." */
const TOP_LEVEL_NAMES = 'mnt|tmp|usr|Users';

const VARIABLE = String.raw`\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*])`;
const UNDER_VARIABLE = new RegExp(`^${VARIABLE}(?:/\\*|/)$`);
const VARIABLE_TOP_LEVEL = new RegExp(`^${VARIABLE}/(?:${TOP_LEVEL_NAMES})$`);
const GUARDED = /^\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/;
const WHOLE_SUBSTITUTION = /^(?:\$\([^)]*\)|`[^`]*`)$/;
const TRAILING_SUBSTITUTION = /(?:\$\([^)]*\)|`[^`]*`)$/;
const MANY_LEVELS = /\/\*\/(?:\*)?$/;
const DIRECTORY_ASSIGNMENT =
  /(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=(?:\$\((?:pwd|git rev-parse --show-toplevel)\)|`pwd`)/g;

const unquote = (text: string): string => text.replaceAll('"', '').replaceAll("'", '');

/** The variables the command itself assigns from a directory-printing substitution. */
function assignedDirectories(command: string): ReadonlySet<string> {
  return new Set([...command.matchAll(DIRECTORY_ASSIGNMENT)].map((match) => match[1] ?? ''));
}

interface Scope {
  readonly paths: PathContext;
  readonly assigned: ReadonlySet<string>;
  readonly recursive: boolean;
}

/** Whether `directory` is critical: root, top level, home, the working directory or a parent of it. */
function isCriticalDirectory(directory: string, paths: PathContext): boolean {
  const depth = directory.split('/').filter((segment) => segment !== '').length;
  const topLevel = paths.platform === 'windows' ? 2 : 1;
  return (
    depth <= topLevel ||
    directory === posixOf(paths.home, paths) ||
    relativeWithin(directory, posixOf(paths.cwd, paths)) !== undefined
  );
}

/** Whether `directory` is, or is a parent of, an additional working directory. */
const coversAdditionalDirectory = (directory: string, paths: PathContext): boolean =>
  paths.additionalDirectories.some(
    (added) => relativeWithin(directory, posixOf(added, paths)) !== undefined,
  );

/** A literal path target, as a glob under a directory or as the path itself. */
function isCriticalPath(target: string, paths: PathContext): boolean {
  const glob = target.endsWith('/*');
  const text = glob ? target.slice(0, -2) || '/' : target;
  const resolved = normalizeAbsolute(absolutePath(expandHome(text, paths), paths));
  if (isCriticalDirectory(resolved, paths)) return true;
  return glob && coversAdditionalDirectory(resolved, paths);
}

const isAssignedVariable = (target: string, assigned: ReadonlySet<string>): boolean => {
  const name = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(target)?.[1];
  return name !== undefined && assigned.has(name);
};

/** The forms of "Other targets that count as critical paths" that need no path arithmetic. */
const SHELL_FORMS: readonly ((target: string, scope: Scope) => boolean)[] = [
  (target) => UNDER_VARIABLE.test(target) || VARIABLE_TOP_LEVEL.test(target),
  (target, scope) => isAssignedVariable(target, scope.assigned),
  (target, scope) => scope.recursive && WHOLE_SUBSTITUTION.test(target),
  (target) => MANY_LEVELS.test(target),
];

const replaceHome = (target: string): string => target.replace(/^\$\{?HOME\}?(?=\/|$)/, '~');

/** Whether one operand of an `rm` or `rmdir` is a critical-path target. */
function isCriticalTarget(operand: string, scope: Scope): boolean {
  const target = unquote(operand);
  if (GUARDED.test(target)) return false;
  if (SHELL_FORMS.some((form) => form(target, scope))) return true;
  const withoutSubstitution = target.replace(TRAILING_SUBSTITUTION, '');
  const literal = replaceHome(withoutSubstitution);
  return !literal.includes('$') && literal !== '' && isCriticalPath(literal, scope.paths);
}

const RECURSIVE_OPTION = /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)$/;

/** The operands of an `rm` or `rmdir` and whether it is recursive: options end at `--`. */
function operandsOf(words: readonly string[]): { operands: string[]; recursive: boolean } {
  const operands: string[] = [];
  let recursive = false;
  let options = true;
  for (const word of words) {
    if (options && word === '--') options = false;
    else if (options && word.startsWith('-')) recursive ||= RECURSIVE_OPTION.test(word);
    else operands.push(word);
  }
  return { operands, recursive };
}

/** The script a `sh -c '...'` runs, quotes around it removed, or `undefined`. */
function inlineScript(words: readonly string[]): string | undefined {
  const at = words.indexOf('-c');
  const script = at < 0 ? undefined : words[at + 1];
  return script?.replace(/^(["'])([\s\S]*)\1$/, '$2');
}

/** Whether one subcommand removes a critical path: an `rm` or `rmdir`, or an inline shell script that does. */
function subcommandRemoves(subcommand: string, command: Scope, depth: number): boolean {
  const words = wordsOf(stripWrappers(subcommand, 'deny')).map((word) => word.text);
  const [program, ...rest] = words;
  if (program === undefined) return false;
  if (REMOVERS.has(program)) {
    const { operands, recursive } = operandsOf(rest);
    return operands.some((operand) => isCriticalTarget(operand, { ...command, recursive }));
  }
  const script = SHELLS.has(program) ? inlineScript(rest) : undefined;
  return script !== undefined && depth < 4 && removesCriticalPath(script, command.paths, depth + 1);
}

/**
 * Whether a shell command contains a recognized critical-path removal, anywhere in it: in a
 * compound command, a subshell, a command substitution or an inline `sh -c` script.
 */
export function removesCriticalPath(command: string, paths: PathContext, depth = 0): boolean {
  const scope: Scope = { paths, assigned: assignedDirectories(command), recursive: false };
  return scanCommand(command).subcommands.some((sub) => subcommandRemoves(sub, scope, depth));
}
