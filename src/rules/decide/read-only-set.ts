import { isNetworkPath } from '../path/network.ts';
import type { PathContext } from '../types.ts';
import { spellingsOf, type ShellWord } from '../bash/words.ts';

/**
 * The built-in read-only Bash commands (permissions.md, "Read-only commands"): "The set includes
 * `ls`, `cat`, `echo`, `pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`, `diff`, `stat`, `du`,
 * `cd`, and read-only forms of `git`", and the docs' prompt cases name `docker`, `file` and `ps` as
 * members. `cd` and `git` have their own rules in `shell-commands.ts`.
 */
export const READ_ONLY_PROGRAMS: ReadonlySet<string> = new Set([
  'ls',
  'cat',
  'echo',
  'pwd',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'which',
  'diff',
  'stat',
  'du',
  'file',
  'ps',
  'docker',
  'podman',
  'node',
  'python',
  'python3',
]);

/** `--output <file>` / `--output=<file>`: `git diff`, `log` and `show` write their output to a file. */
const writesOutput = (args: readonly string[]): boolean =>
  args.some((arg) => arg === '--output' || arg.startsWith('--output='));

/** The flags of `git branch` that only list; any other word names, moves or deletes a branch. */
const BRANCH_LISTING: ReadonlySet<string> = new Set([
  '--show-current',
  '--list',
  '-a',
  '--all',
  '-r',
  '--remotes',
  '-v',
  '-vv',
  '--verbose',
]);

/**
 * The "read-only forms of `git`" the docs do not list: a seed (spec/judgments.md), each subcommand
 * with what keeps its arguments read-only.
 */
export const GIT_READ_ONLY: {
  readonly [subcommand: string]: (args: readonly string[]) => boolean;
} = {
  status: () => true,
  log: (args) => !writesOutput(args),
  diff: (args) => !writesOutput(args),
  show: (args) => !writesOutput(args),
  branch: (args) => args.every((arg) => BRANCH_LISTING.has(arg)),
};

/** The read-only forms of `docker` and `podman`: a seed (spec/judgments.md). */
const CONTAINER_READ_ONLY: ReadonlySet<string> = new Set([
  'ps',
  'images',
  'logs',
  'inspect',
  'version',
  'info',
]);

/** "a flag that selects a different daemon, such as `-H`, `--context`, or Podman's `--url` and `--connection`". */
const DAEMON_FLAG = /^(?:-H|-c|--host|--context|--url|--connection)(?:=|$)|^-H./;

/** `-m`/`--magic-file` and `-f`/`--files-from` "make `file` open the paths named in the flag's value". */
const FILE_OPENING_FLAG = /^(?:-[A-Za-z]*[mf][A-Za-z]*|--magic-file(?:=.*)?|--files-from(?:=.*)?)$/;

/** BSD-style option letters: `aux`, `auxe`. */
const BSD_OPTIONS = /^[A-Za-z]+$/;

/**
 * `ps` "prompts when one of its arguments could act as the `e` option": a BSD-style group with an
 * `e` (`auxe`), or a dashed `-e` after a BSD-style group (`aux -e`). `ps aux` and `ps -ef` run.
 */
function psMayPrintEnvironment(args: readonly string[]): boolean {
  const bsd = args.some((arg) => BSD_OPTIONS.test(arg));
  return args.some((arg) => {
    if (arg.startsWith('--')) return false;
    if (BSD_OPTIONS.test(arg)) return arg.includes('e');
    return bsd && /^-[A-Za-z]*e/.test(arg);
  });
}

const WHICH_OPTIONS: ReadonlySet<string> = new Set(['-a', '--all']);

function containerIsReadOnly(args: readonly string[]): boolean {
  const subcommand = args.find((arg) => !arg.startsWith('-'));
  return (
    subcommand !== undefined &&
    CONTAINER_READ_ONLY.has(subcommand) &&
    !args.some((arg) => DAEMON_FLAG.test(arg))
  );
}

/**
 * A version query alone: `node -v`, `node --version`, `python --version`, `python3 --version`. Judgment
 * (spec/judgments.md, oracle 2.1.319): the docs' set "includes" more than it names; these four forms
 * run without a prompt and every other one asks (`node -V`, `python3 -V`, `npm -v`, `node -v -e 1`).
 */
const versionQuery =
  (...flags: readonly string[]) =>
  (args: readonly string[]): boolean =>
    args.length === 1 && flags.includes(args[0] ?? '');

/** Per program, whether its arguments keep it read-only: a prompt case of the docs, or a version query. */
const ARGUMENT_CHECKS: { readonly [program: string]: (args: readonly string[]) => boolean } = {
  node: versionQuery('-v', '--version'),
  python: versionQuery('--version'),
  python3: versionQuery('--version'),
  ps: (args) => !psMayPrintEnvironment(args),
  file: (args) => !args.some((arg) => FILE_OPENING_FLAG.test(arg)),
  docker: containerIsReadOnly,
  podman: containerIsReadOnly,
  // GNU `which` reads aliases and functions from its input with `-i`, `--read-alias` and
  // `--read-functions`; a plain lookup, with or without `-a`, is all the kit reads as read-only.
  which: (args) => args.every((arg) => !arg.startsWith('-') || WHICH_OPTIONS.has(arg)),
};

/** Whether the arguments of `program` are read-only: a program with no entry is read-only whatever it is given. */
export function argumentsAreReadOnly(program: string, words: readonly string[]): boolean {
  const check = Object.hasOwn(ARGUMENT_CHECKS, program) ? ARGUMENT_CHECKS[program] : undefined;
  return check === undefined || check(words.slice(1));
}

/** "a command whose arguments include a network (UNC) path ... prompts" (Windows only). */
export const hasNetworkArgument = (words: readonly ShellWord[], paths: PathContext): boolean =>
  paths.platform === 'windows' &&
  words
    .slice(1)
    .some((word) => spellingsOf(word).some((spelling) => isNetworkPath(spelling, paths.platform)));

/**
 * Shell variables whose writes change how the shell runs the rest of the command: "certain special
 * shell variables, such as `PATH` or `IFS`". The docs name two; the rest are the kit's seed
 * (spec/judgments.md).
 */
const SPECIAL_VARIABLES = [
  'PATH',
  'IFS',
  'CDPATH',
  'ENV',
  'BASH_ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'PS4',
  'PROMPT_COMMAND',
  'GLOBIGNORE',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
];

const NAME = `(?:${SPECIAL_VARIABLES.join('|')})`;
const BOUNDARY = String.raw`(?:^|[\s;&|(])`;

const SPECIAL_WRITES: readonly RegExp[] = [
  // `NAME=value`, `export NAME=value`, `declare -x NAME+=value`
  new RegExp(
    String.raw`${BOUNDARY}(?:(?:export|declare|typeset|readonly|local)\s+(?:-\w+\s+)*)?${NAME}\+?=`,
  ),
  // `unset PATH`, `unset -v a PATH`
  new RegExp(String.raw`${BOUNDARY}unset\b[^;&|\n]*\b${NAME}\b`),
  // `for IFS in ...`, `select PATH in ...`, `read IFS`
  new RegExp(String.raw`${BOUNDARY}(?:for|select)\s+${NAME}\b`),
  new RegExp(String.raw`${BOUNDARY}read\b[^;&|\n]*\b${NAME}\b`),
];

/** Whether a command sets, unsets or loops over a special shell variable, anywhere in it (quoted text included). */
export const touchesSpecialVariable = (command: string): boolean =>
  SPECIAL_WRITES.some((pattern) => pattern.test(command));
