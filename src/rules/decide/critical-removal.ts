import { scanCommand } from '../bash/split.ts';
import { spellingsOf, type ShellCommand, type ShellWord } from '../bash/words.ts';
import { strippedWords } from '../bash/wrappers.ts';
import { absolutePath, dirnameOf, relativeWithin } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import { posixOf } from './scope.ts';

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

/** The words after which a command runs another: `find -exec sh -c '...'` (the docs' own example). */
const EXECUTORS: ReadonlySet<string> = new Set(['-exec', '-execdir', '-ok', '-okdir']);

/** "A shell variable followed by one common top-level directory name, such as `mnt`, `tmp`, `usr`, or `Users`." */
const TOP_LEVEL_NAMES = 'mnt|tmp|usr|Users';

const VARIABLE = String.raw`\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*])`;
const UNDER_VARIABLE = new RegExp(`^${VARIABLE}(?:/\\*|/)$`);
const VARIABLE_TOP_LEVEL = new RegExp(`^${VARIABLE}/(?:${TOP_LEVEL_NAMES})$`);
const GUARDED = /^\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/;
const WHOLE_SUBSTITUTION = /^(?:\$\([^)]*\)|`[^`]*`)$/;
const TRAILING_SUBSTITUTION = /(?:\$\([^)]*\)|`[^`]*`)$/;
const MANY_LEVELS = /\/\*\/(?:\*)?$/;
const POSITIONAL = /^\$(?:\{[0-9@*]+\}|[0-9@*])/;
const ONLY_BACKSLASHES = /^\\+$/;
const VOLUME_GUID = /^\\\\\?\\Volume\{[^}]*\}/i;
const RELATIVE_GLOB = /^[^/~$\\].*\/\*$/;
const DIRECTORY_ASSIGNMENT =
  /(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=(?:\$\((?:pwd|git rev-parse --show-toplevel)\)|`pwd`)/g;

/** The variables the command itself assigns from a directory-printing substitution. */
function assignedDirectories(command: string): ReadonlySet<string> {
  return new Set([...command.matchAll(DIRECTORY_ASSIGNMENT)].map((match) => match[1] ?? ''));
}

interface Scope {
  readonly paths: PathContext;
  readonly assigned: ReadonlySet<string>;
  readonly recursive: boolean;
  /** Arguments after an inline script give `$1` and `$@` a value. */
  readonly bound: boolean;
  /** A `cd` ran earlier in the command, so a relative target no longer says where it is. */
  moved: boolean;
}

/** On Windows, "its 8.3 short name counts too, such as `C:\Users\LONGNA~1`": a `~N` name beside the home directory. */
function isHomeShortName(directory: string, paths: PathContext): boolean {
  const home = posixOf(paths.home, paths);
  return (
    paths.platform === 'windows' &&
    dirnameOf(directory) === dirnameOf(home) &&
    /~\d+$/.test(directory)
  );
}

/** The filesystem root, a top-level directory (a drive root or its children on Windows) or the home directory. */
export function isSystemDirectory(directory: string, paths: PathContext): boolean {
  const depth = directory.split('/').filter((segment) => segment !== '').length;
  const topLevel = paths.platform === 'windows' ? 2 : 1;
  return (
    depth <= topLevel ||
    relativeWithin(posixOf(paths.home, paths), directory, paths.platform) === '' ||
    isHomeShortName(directory, paths)
  );
}

/** Whether `directory` is critical: a system directory, the working directory or a parent of it. */
export const isCriticalDirectory = (directory: string, paths: PathContext): boolean =>
  isSystemDirectory(directory, paths) ||
  relativeWithin(directory, posixOf(paths.cwd, paths), paths.platform) !== undefined;

/** "Spellings such as `\\?\C:\` and `\\localhost\C$` count as `C:\`." */
function windowsSpelling(target: string, paths: PathContext): string {
  if (paths.platform !== 'windows') return target;
  return target
    .replace(/^\\\\\?\\(?=[A-Za-z]:)/, '')
    .replace(/^\\\\localhost\\([A-Za-z])\$/i, '$1:');
}

/** Whether `directory` is, or is a parent of, an additional working directory. */
const coversAdditionalDirectory = (directory: string, paths: PathContext): boolean =>
  paths.additionalDirectories.some(
    (added) => relativeWithin(directory, posixOf(added, paths), paths.platform) !== undefined,
  );

/** A literal path target, as a glob under a directory or as the path itself. */
function isCriticalPath(target: string, paths: PathContext): boolean {
  const glob = target.endsWith('/*');
  const text = glob ? target.slice(0, -2) || '/' : target;
  const resolved = absolutePath(text, paths);
  if (isCriticalDirectory(resolved, paths)) return true;
  return glob && coversAdditionalDirectory(resolved, paths);
}

const isAssignedVariable = (target: string, assigned: ReadonlySet<string>): boolean => {
  const name = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(target)?.[1];
  return name !== undefined && assigned.has(name);
};

/** The forms of "Other targets that count as critical paths" that need no path arithmetic. */
const SHELL_FORMS: readonly ((target: string, scope: Scope) => boolean)[] = [
  // "The same form under a positional parameter ... when nothing in the command gives it a value".
  (target, scope) =>
    (UNDER_VARIABLE.test(target) || VARIABLE_TOP_LEVEL.test(target)) &&
    !(scope.bound && POSITIONAL.test(target)),
  (target, scope) => isAssignedVariable(target, scope.assigned),
  (target, scope) => scope.recursive && WHOLE_SUBSTITUTION.test(target),
  (target) => MANY_LEVELS.test(target),
  (target) => ONLY_BACKSLASHES.test(target) || VOLUME_GUID.test(target),
  // `cd logs && rm -rf a/*`: after a `cd` a relative glob reaches a directory the check cannot place.
  (target, scope) => scope.moved && RELATIVE_GLOB.test(target),
];

const replaceHome = (target: string): string => target.replace(/^\$\{?HOME\}?(?=\/|$)/, '~');

/** Whether one operand of an `rm` or `rmdir` is a critical-path target, in either of its spellings. */
const isCriticalTarget = (operand: ShellWord, scope: Scope): boolean =>
  spellingsOf(operand).some((spelling) => isCriticalSpelling(spelling, scope));

function isCriticalSpelling(spelling: string, scope: Scope): boolean {
  const target = windowsSpelling(spelling, scope.paths);
  if (GUARDED.test(target)) return false;
  if (SHELL_FORMS.some((form) => form(target, scope))) return true;
  const withoutSubstitution = target.replace(TRAILING_SUBSTITUTION, '');
  const literal = replaceHome(withoutSubstitution);
  return !literal.includes('$') && literal !== '' && isCriticalPath(literal, scope.paths);
}

const RECURSIVE_OPTION = /^(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)$/;

/** The operands of an `rm` or `rmdir` and whether it is recursive: options end at `--`. */
function operandsOf(words: readonly ShellWord[]): { operands: ShellWord[]; recursive: boolean } {
  const operands: ShellWord[] = [];
  let recursive = false;
  let options = true;
  for (const word of words) {
    const { value } = word;
    if (options && value === '--') options = false;
    else if (options && value.startsWith('-')) recursive ||= RECURSIVE_OPTION.test(value);
    else operands.push(word);
  }
  return { operands, recursive };
}

/** An inline shell script, as the inner shell receives it, and whether arguments after it bind `$1`. */
interface InlineScript {
  readonly script: string;
  readonly bound: boolean;
}

const QUOTED = /^(["'])([\s\S]*)\1$/;

/**
 * "When the script is double-quoted, the invoking shell expands its variables before the inner shell
 * receives the script": a positional parameter of the invoking shell is empty, and `\"` is a quote.
 */
const expandDoubleQuoted = (text: string): string =>
  text.replace(
    /\\([\\"$`])|\$(?:\{[0-9@*]+\}|[0-9@*])/g,
    (_match, escaped?: string) => escaped ?? '',
  );

/** The script a `sh -c '...'` runs, as the inner shell sees it, or `undefined`. */
function inlineScript(words: readonly ShellWord[]): InlineScript | undefined {
  const at = words.findIndex((word) => word.value === '-c');
  const word = at < 0 ? undefined : words[at + 1];
  if (word === undefined) return undefined;
  const quoted = QUOTED.exec(word.text);
  const script = quoted?.[1] === '"' ? expandDoubleQuoted(quoted[2] ?? '') : word.value;
  return { script, bound: words.length > at + 2 };
}

/** The shells a subcommand runs with `-c`: as its program, or after `-exec` and the like. */
function inlineScripts(words: readonly ShellWord[]): readonly InlineScript[] {
  return words.flatMap((word, index) => {
    const runs =
      SHELLS.has(word.value) && (index === 0 || EXECUTORS.has(words[index - 1]?.value ?? ''));
    const script = runs ? inlineScript(words.slice(index + 1)) : undefined;
    return script === undefined ? [] : [script];
  });
}

/** Whether one subcommand removes a critical path: an `rm` or `rmdir`, or an inline shell script that does. */
function subcommandRemoves(subcommand: ShellCommand, command: Scope, depth: number): boolean {
  const words = strippedWords(subcommand, 'deny');
  const [program, ...rest] = words;
  if (program === undefined) return false;
  // `"rm"`, `\rm` and `$'rm'` run `rm` all the same (src/rules/bash/unquote.ts).
  if (REMOVERS.has(program.value)) {
    const { operands, recursive } = operandsOf(rest);
    return operands.some((operand) => isCriticalTarget(operand, { ...command, recursive }));
  }
  return (
    depth < 4 &&
    inlineScripts(words).some(({ script, bound }) =>
      removesCriticalPath(script, command.paths, depth + 1, bound),
    )
  );
}

/** "Dangerous rm operation not ruled out": a command the kit cannot read to the end may hide a removal. */
export const cannotRuleOutRemoval = (command: string): boolean => !scanCommand(command).parseable;

const changesDirectory = (subcommand: ShellCommand): boolean => subcommand.words[0]?.value === 'cd';

/**
 * Whether a shell command contains a recognized critical-path removal, anywhere in it: in a
 * compound command, a subshell, a command substitution or an inline `sh -c` script.
 */
export function removesCriticalPath(
  command: string,
  paths: PathContext,
  depth = 0,
  bound = false,
): boolean {
  const scope: Scope = {
    paths,
    assigned: assignedDirectories(command),
    recursive: false,
    bound,
    moved: false,
  };
  for (const sub of scanCommand(command).commands) {
    if (subcommandRemoves(sub, scope, depth)) return true;
    scope.moved ||= changesDirectory(sub);
  }
  return false;
}
