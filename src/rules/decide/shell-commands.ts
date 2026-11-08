import { requiresPromptDespitePrefixRule } from '../bash/exec-wrappers.ts';
import { scanCommand, wordsOf } from '../bash/split.ts';
import { stripWrappers } from '../bash/wrappers.ts';
import { absolutePath } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import type { ProtectedPathOptions } from './context.ts';
import { isProtectedPath } from './protected-paths.ts';
import { expandHome, inScope, posixOf } from './scope.ts';

/**
 * What a Bash command is, as far as the modes need it: read-only (permissions.md, "Read-only
 * commands"), or made of the filesystem commands `acceptEdits` approves (permission-modes.md,
 * "Auto-approve file edits with acceptEdits mode"), or neither. Every subcommand is looked at, in
 * the order the command runs them, with a `cd` moving the directory later operands are read against.
 */
export interface ShellVerdict {
  /** Every subcommand is in the read-only set. */
  readonly readOnly: boolean;
  /** Every subcommand is read-only or a filesystem command on paths in scope and not protected. */
  readonly editsInScope: boolean;
  /** A filesystem command's operand is a protected path. */
  readonly writesProtected: boolean;
  /** The subcommands in reading order, and for each whether it is read-only on its own. */
  readonly subcommands: readonly string[];
  readonly readOnlyParts: readonly boolean[];
}

/** A command the kit could not read to the end, or one too long to analyse: nothing about it is approved. */
export const UNREAD: ShellVerdict = {
  readOnly: false,
  editsInScope: false,
  writesProtected: false,
  subcommands: [],
  readOnlyParts: [],
};

/** "Commands longer than 10,000 characters always prompt because they exceed what the analysis parses." */
const MAX_COMMAND_LENGTH = 10_000;

/**
 * "The set includes `ls`, `cat`, `echo`, `pwd`, `head`, `tail`, `grep`, `find`, `wc`, `which`,
 * `diff`, `stat`, `du`, `cd`, and read-only forms of `git`." The names are the docs'; `cd` and `git`
 * have their own rules below.
 */
const READ_ONLY_PROGRAMS: ReadonlySet<string> = new Set([
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
]);

/** The "read-only forms of `git`" the docs do not list: a seed (spec/judgments.md). */
const GIT_READ_ONLY: ReadonlySet<string> = new Set(['status', 'log', 'diff', 'show']);

/** "`mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, and `sed`." */
const FILESYSTEM_PROGRAMS: ReadonlySet<string> = new Set([
  'mkdir',
  'touch',
  'rm',
  'rmdir',
  'mv',
  'cp',
  'sed',
]);

/** Commands with write-capable or exec-capable flags: "prompt when an unquoted glob is present". */
const GLOB_SENSITIVE: ReadonlySet<string> = new Set(['find', 'git']);

const SCRIPT_OPTIONS: ReadonlySet<string> = new Set(['-e', '-f', '--expression', '--file']);

interface Walk {
  readonly paths: PathContext;
  readonly options: ProtectedPathOptions;
  /** The directory later operands are read against: moved by a `cd`. */
  base: string;
  changedDirectory: boolean;
  usedGit: boolean;
}

const isQuoted = (word: string): boolean => /^["']/.test(word);
const unquote = (word: string): string => word.replaceAll('"', '').replaceAll("'", '');
const hasUnquotedGlob = (words: readonly string[]): boolean =>
  words.some((word) => !isQuoted(word) && /[*?[]/.test(word));

/**
 * A redirect to a file: a `>`, `>>` or `<` whose target is not `/dev/null`. Descriptor forms such
 * as `2>&1` and here-documents are not (permissions.md, "Redirections"); the targets that are files
 * are not checked against rules here, so such a command is simply not read-only (spec/judgments.md).
 */
function redirectsToFile(words: readonly string[]): boolean {
  return words.some((word, index) => {
    if (isQuoted(word) || !/[<>]/.test(word) || /<</.test(word)) return false;
    if (/^\d*[<>]&(?:\d+|-)$/.test(word)) return false;
    const target = word.replace(/^.*?(?:&>|>>|>|<)/, '') || (words[index + 1] ?? '');
    return target !== '/dev/null';
  });
}

/** The absolute POSIX path of an operand, or `undefined` when a variable, substitution or glob hides it. */
function operandPath(operand: string, walk: Walk): string | undefined {
  const text = unquote(operand);
  if (text === '' || /[$`*?[]/.test(text)) return undefined;
  return absolutePath(expandHome(text, walk.paths), { ...walk.paths, cwd: walk.base });
}

/** `cd`: read-only when it moves into the working directory or an additional directory. */
function readOnlyCd(words: readonly string[], walk: Walk): boolean {
  const target = operandPath(words[1] ?? '~', walk);
  if (target === undefined || words.length > 2 || !inScope(target, walk.paths)) return false;
  walk.changedDirectory ||= target !== walk.base;
  walk.base = target;
  return true;
}

/** `git status`, `git log`, `git diff` and `git show`, with no option before the subcommand. */
function readOnlyGit(words: readonly string[], walk: Walk): boolean {
  walk.usedGit = true;
  return GIT_READ_ONLY.has(words[1] ?? '');
}

const SPECIAL: { readonly [program: string]: (words: readonly string[], walk: Walk) => boolean } = {
  cd: readOnlyCd,
  git: readOnlyGit,
};

function isReadOnly(subcommand: string, words: readonly string[], walk: Walk): boolean {
  const program = words[0] ?? '';
  const special = Object.hasOwn(SPECIAL, program) ? SPECIAL[program] : undefined;
  const known = special !== undefined || READ_ONLY_PROGRAMS.has(program);
  if (!known || redirectsToFile(words) || requiresPromptDespitePrefixRule(subcommand)) return false;
  if (GLOB_SENSITIVE.has(program) && hasUnquotedGlob(words.slice(1))) return false;
  return special === undefined || special(words, walk);
}

/** The operands of a filesystem command (`touch` takes no option; `sed`'s first operand is its script). */
function filesystemOperands(program: string, words: readonly string[]): string[] | undefined {
  const rest = words.slice(1);
  const options = rest.filter((word) => word.startsWith('-') && word !== '--');
  if (program === 'touch' && options.length > 0) return undefined;
  const operands = rest.filter((word) => !word.startsWith('-'));
  const scripted = program === 'sed' && !options.some((option) => SCRIPT_OPTIONS.has(option));
  return scripted ? operands.slice(1) : operands;
}

/** A filesystem command and where it writes: `touch` as written, the others past safe prefixes. */
function filesystemTargets(
  subcommand: string,
  words: readonly string[],
  walk: Walk,
): readonly (string | undefined)[] | undefined {
  const stripped = wordsOf(stripWrappers(subcommand, 'allow')).map((word) => word.text);
  const program = stripped[0] ?? '';
  const prefixed = stripped.length !== words.length;
  if (!FILESYSTEM_PROGRAMS.has(program) || (program === 'touch' && prefixed)) return undefined;
  if (redirectsToFile(words)) return undefined;
  const operands = filesystemOperands(program, stripped);
  if (operands === undefined || operands.length === 0) return undefined;
  return operands.map((operand) => operandPath(operand, walk));
}

interface SubVerdict {
  readonly readOnly: boolean;
  readonly edits: boolean;
  readonly protectedWrite: boolean;
}

function judge(subcommand: string, walk: Walk): SubVerdict {
  const words = wordsOf(subcommand).map((word) => word.text);
  if (isReadOnly(subcommand, words, walk)) {
    return { readOnly: true, edits: true, protectedWrite: false };
  }
  const targets = filesystemTargets(subcommand, words, walk);
  if (targets === undefined) return { readOnly: false, edits: false, protectedWrite: false };
  const known = targets.filter((target): target is string => target !== undefined);
  const protectedWrite = known.some((target) => isProtectedPath(target, walk.paths, walk.options));
  const inside =
    known.length === targets.length && known.every((target) => inScope(target, walk.paths));
  return { readOnly: false, edits: inside && !protectedWrite, protectedWrite };
}

/** The verdict on a Bash command: see `ShellVerdict`. */
export function shellVerdict(
  command: string,
  paths: PathContext,
  options: ProtectedPathOptions = {},
): ShellVerdict {
  const scan = scanCommand(command);
  if (!scan.parseable || command.length > MAX_COMMAND_LENGTH || scan.subcommands.length === 0) {
    return UNREAD;
  }
  const walk: Walk = {
    paths,
    options,
    base: posixOf(paths.cwd, paths),
    changedDirectory: false,
    usedGit: false,
  };
  const verdicts = scan.subcommands.map((subcommand) => judge(subcommand, walk));
  // "`cd` with `git`: prompts when the `cd` changes into a different directory."
  const readOnly =
    verdicts.every((verdict) => verdict.readOnly) && !(walk.changedDirectory && walk.usedGit);
  return {
    readOnly,
    editsInScope:
      verdicts.every((verdict) => verdict.edits) && !(walk.changedDirectory && walk.usedGit),
    writesProtected: verdicts.some((verdict) => verdict.protectedWrite),
    subcommands: scan.subcommands,
    readOnlyParts: verdicts.map((verdict) => verdict.readOnly),
  };
}
