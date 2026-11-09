import { requiresPromptDespitePrefixRule } from '../bash/exec-wrappers.ts';
import { scanCommand, wordsOf } from '../bash/split.ts';
import { stripWrappers } from '../bash/wrappers.ts';
import type { PathContext } from '../types.ts';
import type { ProtectedPathOptions } from './context.ts';
import { isProtectedPath, isSymlinkTargetOnly } from './protected-paths.ts';
import {
  argumentsAreReadOnly,
  FILE_READING_PROGRAMS,
  GIT_READ_ONLY,
  hasNetworkArgument,
  READ_ONLY_PROGRAMS,
  touchesSpecialVariable,
} from './read-only-set.ts';
import { inScope, posixOf } from './scope.ts';
import {
  hasUnquotedGlob,
  operandPath,
  readPath,
  redirectsToFile,
  type Walk,
} from './shell-words.ts';

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
  /** Protected only where a symlink leads, or as the target of a symlinked settings file. */
  readonly writesProtectedViaLink: boolean;
  /** A file-reading command's operand is outside the working directories, or cannot be told. */
  readonly readsOutside: boolean;
  /** The parser cannot trace the command: it does not parse, changes directory twice or runs a subshell. */
  readonly untraceable: boolean;
  /** The subcommands in reading order, and for each whether it is read-only on its own. */
  readonly subcommands: readonly string[];
  readonly readOnlyParts: readonly boolean[];
}

/** A command with nothing to read, or one that is not Bash: nothing about it is approved. */
export const UNREAD: ShellVerdict = {
  readOnly: false,
  editsInScope: false,
  writesProtected: false,
  writesProtectedViaLink: false,
  readsOutside: false,
  untraceable: false,
  subcommands: [],
  readOnlyParts: [],
};

/** A command the kit could not read to the end, or one too long to analyse. */
const UNPARSED: ShellVerdict = { ...UNREAD, untraceable: true };

/** "Commands longer than 10,000 characters always prompt because they exceed what the analysis parses." */
const MAX_COMMAND_LENGTH = 10_000;

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

/**
 * `cd`: read-only when it moves into the working directory or an additional directory. `cd -` goes
 * to a directory the kit cannot know, so it is not read-only (spec/judgments.md).
 */
function readOnlyCd(words: readonly string[], walk: Walk): boolean {
  const operand = words[1] ?? '~';
  const target = operand === '-' ? undefined : operandPath(operand, walk);
  if (target === undefined || words.length > 2 || !inScope(target, walk.paths)) return false;
  walk.changedDirectory ||= target !== walk.base;
  walk.base = target;
  return true;
}

/** A read-only form of `git` (`GIT_READ_ONLY`), with no option before the subcommand. */
function readOnlyGit(words: readonly string[], walk: Walk): boolean {
  walk.usedGit = true;
  const form = Object.hasOwn(GIT_READ_ONLY, words[1] ?? '')
    ? GIT_READ_ONLY[words[1] ?? '']
    : undefined;
  return form?.(words.slice(2)) ?? false;
}

const SPECIAL: { readonly [program: string]: (words: readonly string[], walk: Walk) => boolean } = {
  cd: readOnlyCd,
  git: readOnlyGit,
};

/** What keeps a known program read-only: no file redirect, no glob that could be a flag, and the docs' prompt cases. */
function argumentsPermit(subcommand: string, words: readonly string[], walk: Walk): boolean {
  const program = words[0] ?? '';
  const globFlag = GLOB_SENSITIVE.has(program) && hasUnquotedGlob(words.slice(1));
  return (
    !redirectsToFile(words) &&
    !requiresPromptDespitePrefixRule(subcommand) &&
    !globFlag &&
    !hasNetworkArgument(words, walk.paths) &&
    argumentsAreReadOnly(program, words)
  );
}

function isReadOnly(subcommand: string, words: readonly string[], walk: Walk): boolean {
  const program = words[0] ?? '';
  const special = Object.hasOwn(SPECIAL, program) ? SPECIAL[program] : undefined;
  const known = special !== undefined || READ_ONLY_PROGRAMS.has(program);
  if (!known || !argumentsPermit(subcommand, words, walk)) return false;
  return special === undefined || special(words, walk);
}

/**
 * Whether a file-reading command reads outside the working directories, by an operand it names, a
 * glob's directory or a path the symlink check resolved. An operand a variable or substitution
 * hides counts as outside (spec/judgments.md).
 */
function readsOutsideScope(words: readonly string[], walk: Walk): boolean {
  if (!FILE_READING_PROGRAMS.has(words[0] ?? '')) return false;
  const operands = words.slice(1).filter((word) => !word.startsWith('-'));
  const reads = [...operands.map((operand) => readPath(operand, walk)), ...walk.resolved];
  return reads.some((path) => path === undefined || !inScope(path, walk.paths));
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

export interface SubVerdict {
  readonly readOnly: boolean;
  readonly edits: boolean;
  readonly protectedWrite: boolean;
  readonly viaLink: boolean;
  readonly readsOutside: boolean;
}

const NOTHING: SubVerdict = {
  readOnly: false,
  edits: false,
  protectedWrite: false,
  viaLink: false,
  readsOutside: false,
};

/**
 * A filesystem command's judgment: where it writes is the paths it names and the paths the host's
 * symlink check resolved (permission-modes.md, "Each path also goes through the symlink check").
 */
export function judgeWrite(targets: readonly (string | undefined)[], walk: Walk): SubVerdict {
  const named = targets.filter((target): target is string => target !== undefined);
  const protect = (path: string): boolean => isProtectedPath(path, walk.paths, walk.options);
  const asked = named.some(protect);
  const viaLink =
    !asked &&
    (named.some((path) => isSymlinkTargetOnly(path, walk.paths, walk.options)) ||
      walk.resolved.some(protect));
  const inside =
    named.length === targets.length &&
    [...named, ...walk.resolved].every((p) => inScope(p, walk.paths));
  return {
    ...NOTHING,
    edits: inside && !asked && !viaLink,
    protectedWrite: asked || viaLink,
    viaLink,
  };
}

function judge(subcommand: string, walk: Walk): SubVerdict {
  const words = wordsOf(subcommand).map((word) => word.text);
  const stripped = wordsOf(stripWrappers(subcommand, 'deny')).map((word) => word.text);
  const readsOutside = readsOutsideScope(stripped, walk);
  if (isReadOnly(subcommand, words, walk)) {
    return { ...NOTHING, readOnly: true, edits: true, readsOutside };
  }
  const targets = filesystemTargets(subcommand, words, walk);
  return { ...(targets === undefined ? NOTHING : judgeWrite(targets, walk)), readsOutside };
}

/** A `(`, `$(` or backtick outside single quotes, and outside double quotes that hold no substitution. */
const startsSubshell = (command: string): boolean =>
  /[(`]/.test(
    command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, (quoted) =>
      /\$\(|`/.test(quoted) ? quoted : '',
    ),
  );

/**
 * "A command the shell parser can't trace, such as one that changes directory more than once or
 * runs a subshell", and a `cd` with `git` (the chain that the permission checker also cannot trace).
 */
function isUntraceable(command: string, subcommands: readonly string[], walk: Walk): boolean {
  const changes = subcommands.filter((sub) => wordsOf(sub)[0]?.text === 'cd').length;
  return changes > 1 || startsSubshell(command) || (walk.changedDirectory && walk.usedGit);
}

/** What the subcommands together are: each flag holds when it holds for every subcommand, or for any one, as it reads. */
function combine(
  verdicts: readonly SubVerdict[],
  walk: Walk,
  command: string,
): Pick<
  ShellVerdict,
  'readOnly' | 'editsInScope' | 'writesProtected' | 'writesProtectedViaLink' | 'readsOutside'
> {
  // "`cd` with `git`: prompts when the `cd` changes into a different directory."
  const sound = !(walk.changedDirectory && walk.usedGit) && !touchesSpecialVariable(command);
  const everyWriteViaLink = !verdicts.some((verdict) => verdict.protectedWrite && !verdict.viaLink);
  return {
    readOnly: sound && verdicts.every((verdict) => verdict.readOnly),
    editsInScope: sound && verdicts.every((verdict) => verdict.edits),
    writesProtected: verdicts.some((verdict) => verdict.protectedWrite),
    writesProtectedViaLink: verdicts.some((verdict) => verdict.viaLink) && everyWriteViaLink,
    readsOutside: verdicts.some((verdict) => verdict.readsOutside),
  };
}

/**
 * The verdict on a Bash command: see `ShellVerdict`. `resolved` is where the host's symlink check
 * says the call's paths lead.
 */
export function shellVerdict(
  command: string,
  paths: PathContext,
  options: ProtectedPathOptions = {},
  resolved: readonly string[] = [],
): ShellVerdict {
  const scan = scanCommand(command);
  if (!scan.parseable || command.length > MAX_COMMAND_LENGTH) return UNPARSED;
  if (scan.subcommands.length === 0) return UNREAD;
  const walk: Walk = {
    paths,
    options,
    resolved,
    base: posixOf(paths.cwd, paths),
    changedDirectory: false,
    usedGit: false,
  };
  const verdicts = scan.subcommands.map((subcommand) => judge(subcommand, walk));
  return {
    ...combine(verdicts, walk, command),
    untraceable: isUntraceable(command, scan.subcommands, walk),
    subcommands: scan.subcommands,
    readOnlyParts: verdicts.map((verdict) => verdict.readOnly),
  };
}
