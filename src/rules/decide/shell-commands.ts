import { promptsDespitePrefixRule } from '../bash/exec-wrappers.ts';
import { scanCommand, type CommandScan } from '../bash/split.ts';
import type { ShellCommand, ShellWord } from '../bash/words.ts';
import { readOnlyWords, strippedWords } from '../bash/wrappers.ts';
import { absolutePath } from '../path/posix.ts';
import type { PathContext } from '../types.ts';
import { fileOperands } from './file-targets.ts';
import { filesystemOperands, isFilesystemProgram } from './fs-operands.ts';
import type { ProtectedPathOptions } from './context.ts';
import { isProtectedPath, isSymlinkTargetOnly } from './protected-paths.ts';
import {
  argumentsAreReadOnly,
  GIT_READ_ONLY,
  hasNetworkArgument,
  READ_ONLY_PROGRAMS,
  touchesSpecialVariable,
} from './read-only-set.ts';
import { inScope, posixOf } from './scope.ts';
import { hasUnquotedGlob, operandPath, readPath, type Walk } from './shell-words.ts';

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

/** Commands with write-capable or exec-capable flags: "prompt when an unquoted glob is present". */
const GLOB_SENSITIVE: ReadonlySet<string> = new Set(['find', 'git']);

/**
 * `cd`: read-only when it moves into the working directory or an additional directory. `cd -` goes
 * to a directory the kit cannot know, so it is not read-only (spec/judgments.md).
 */
function readOnlyCd(words: readonly ShellWord[], walk: Walk): boolean {
  const operand = words[1];
  const home = absolutePath('~', walk.paths);
  const target =
    operand === undefined ? home : operand.value === '-' ? undefined : operandPath(operand, walk);
  if (target === undefined || words.length > 2 || !inScope(target, walk.paths)) return false;
  walk.changedDirectory ||= target !== walk.base;
  walk.base = target;
  return true;
}

/** A read-only form of `git` (`GIT_READ_ONLY`), with no option before the subcommand. */
function readOnlyGit(words: readonly ShellWord[], walk: Walk): boolean {
  walk.usedGit = true;
  const subcommand = words[1]?.value ?? '';
  const form = Object.hasOwn(GIT_READ_ONLY, subcommand) ? GIT_READ_ONLY[subcommand] : undefined;
  return form?.(valuesOf(words.slice(2))) ?? false;
}

const valuesOf = (words: readonly ShellWord[]): readonly string[] =>
  words.map((word) => word.value);

const SPECIAL: {
  readonly [program: string]: (words: readonly ShellWord[], walk: Walk) => boolean;
} = {
  cd: readOnlyCd,
  git: readOnlyGit,
};

/** What keeps a known program read-only: no glob that could be a flag, and the docs' prompt cases (redirect targets: `redirects.ts`). */
function argumentsPermit(command: ShellCommand, walk: Walk): boolean {
  const values = valuesOf(command.words);
  const program = values[0] ?? '';
  const globFlag = GLOB_SENSITIVE.has(program) && hasUnquotedGlob(command.words.slice(1));
  return (
    !promptsDespitePrefixRule(command) &&
    !globFlag &&
    !hasNetworkArgument(command.words, walk.paths) &&
    argumentsAreReadOnly(program, values)
  );
}

/**
 * In the read-only set once the wrappers it sees through are removed (`readOnlyWords`); `cd` and
 * `git` only as written (oracle 2.1.322: `LANG=C git status` and `timeout 5 cd sub` were asked).
 */
function isReadOnly(command: ShellCommand, walk: Walk): boolean {
  const { words, stripped } = readOnlyWords(command.words);
  const program = words[0]?.value ?? '';
  const special = Object.hasOwn(SPECIAL, program) ? SPECIAL[program] : undefined;
  const known = special === undefined ? READ_ONLY_PROGRAMS.has(program) : !stripped;
  const inner = { ...command, words };
  if (!known || !argumentsPermit(inner, walk)) return false;
  return special === undefined || special(words, walk);
}

/**
 * Whether a file-reading command reads outside the working directories, by an operand it names, a
 * glob's directory or a path the symlink check resolved. An operand a variable or substitution
 * hides counts as outside (spec/judgments.md).
 */
function readsOutsideScope(words: readonly ShellWord[], walk: Walk): boolean {
  const named = fileOperands(words);
  // A command that only writes the files it names reads none of them.
  if (named === undefined || (named.reads.length === 0 && named.writes.length > 0)) return false;
  const reads = [...named.reads.map((operand) => readPath(operand, walk)), ...walk.resolved];
  return reads.some((path) => path === undefined || !inScope(path, walk.paths));
}

/** A filesystem command and where it writes: `touch` as written, the others past safe prefixes. */
function filesystemTargets(
  command: ShellCommand,
  walk: Walk,
): readonly (string | undefined)[] | undefined {
  const stripped = strippedWords(command, 'allow');
  const program = stripped[0]?.value ?? '';
  const prefixed = stripped.length !== command.words.length;
  if (!isFilesystemProgram(program) || (program === 'touch' && prefixed)) return undefined;
  const operands = filesystemOperands(program, stripped.slice(1));
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

function judge(command: ShellCommand, walk: Walk): SubVerdict {
  const readsOutside = readsOutsideScope(strippedWords(command, 'deny'), walk);
  if (isReadOnly(command, walk)) {
    return { ...NOTHING, readOnly: true, edits: true, readsOutside };
  }
  const targets = filesystemTargets(command, walk);
  return { ...(targets === undefined ? NOTHING : judgeWrite(targets, walk)), readsOutside };
}

/**
 * "A command the shell parser can't trace, such as one that changes directory more than once or
 * runs a subshell", and a `cd` with `git` (the chain that the permission checker also cannot trace).
 * A line that defines a function is one too: a later word may run the function's body under the
 * name of a read-only command (spec/judgments.md).
 */
function isUntraceable(scan: CommandScan, walk: Walk): boolean {
  const changes = scan.commands.filter((command) => command.words[0]?.value === 'cd').length;
  return (
    changes > 1 ||
    scan.nests ||
    scan.functions.length > 0 ||
    (walk.changedDirectory && walk.usedGit)
  );
}

/** What the subcommands together are: each flag holds when it holds for every subcommand, or for any one, as it reads. */
function combine(
  verdicts: readonly SubVerdict[],
  walk: Walk,
  command: string,
  defines: boolean,
): Pick<
  ShellVerdict,
  'readOnly' | 'editsInScope' | 'writesProtected' | 'writesProtectedViaLink' | 'readsOutside'
> {
  // "`cd` with `git`: prompts when the `cd` changes into a different directory." A function
  // defined on the line may run anything under a read-only name.
  const sound =
    !(walk.changedDirectory && walk.usedGit) && !touchesSpecialVariable(command) && !defines;
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
  const verdicts = scan.commands.map((subcommand) => judge(subcommand, walk));
  return {
    ...combine(verdicts, walk, command, scan.functions.length > 0),
    untraceable: isUntraceable(scan, walk),
    subcommands: scan.subcommands,
    readOnlyParts: verdicts.map((verdict) => verdict.readOnly),
  };
}
