import { POWERSHELL_DIALECT } from '../bash/dialect.ts';
import { cmdletCall } from '../bash/powershell.ts';
import { scanCommand } from '../bash/split.ts';
import type { ShellCommand, ShellWord } from '../bash/words.ts';
import type { PathContext } from '../types.ts';
import type { ProtectedPathOptions } from './context.ts';
import { isCriticalDirectory, isSystemDirectory } from './critical-removal.ts';
import { posixOf } from './scope.ts';
import { judgeWrite, UNREAD, type ShellVerdict, type SubVerdict } from './shell-commands.ts';
import { operandPath, type Walk } from './shell-words.ts';

/**
 * permission-modes.md, "Auto-approve file edits with acceptEdits mode": "When the PowerShell tool is
 * enabled, `acceptEdits` mode also auto-approves `Set-Content`, `Add-Content`, `Clear-Content`, and
 * `Remove-Item` on in-scope paths, along with their common aliases." The aliases are the rules'
 * own (`powershell-aliases.ts`), and so is the reading of the name (`&`, a module qualifier).
 */
/** How many positional arguments a cmdlet takes after its path: `Set-Content` and `Add-Content` take the content. */
const CONTENT_ARGUMENTS: { readonly [cmdlet: string]: number } = {
  'set-content': 1,
  'add-content': 1,
  'clear-content': 0,
  'remove-item': 0,
};

/** The named parameters the kit validates; any other named parameter makes a call not approved. */
type ParameterKind = 'path' | 'value' | 'switch' | 'recurse';

const PARAMETERS: ReadonlyMap<string, ParameterKind> = new Map([
  ['-path', 'path'],
  ['-literalpath', 'path'],
  ['-value', 'value'],
  ['-encoding', 'value'],
  ['-force', 'switch'],
  ['-nonewline', 'switch'],
  ['-whatif', 'switch'],
  ['-confirm', 'switch'],
]);

/** `-Recurse` and its unambiguous prefixes, for `Remove-Item` only. */
const RECURSE = /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?$/i;

interface Reading {
  readonly paths: ShellWord[];
  readonly positional: ShellWord[];
  recursive: boolean;
  plain: boolean;
}

/** What each kind of named parameter does to the reading, and how many words after it are its value. */
const HANDLERS: {
  readonly [K in ParameterKind]: (reading: Reading, next: ShellWord | undefined) => number;
} = {
  path: (reading, next) => {
    if (next === undefined) reading.plain = false;
    else reading.paths.push(next);
    return 1;
  },
  value: () => 1,
  switch: () => 0,
  recurse: (reading) => {
    reading.recursive = true;
    return 0;
  },
};

const parameterKind = (cmdlet: string, word: string): ParameterKind | undefined =>
  cmdlet === 'remove-item' && RECURSE.test(word) ? 'recurse' : PARAMETERS.get(word.toLowerCase());

/** A cmdlet call, parsed: the paths it names, whether it is recursive and whether anything else is in it. */
interface Call {
  readonly cmdlet: string;
  readonly paths: readonly ShellWord[];
  readonly recursive: boolean;
  readonly plain: boolean;
}

/**
 * "A positional argument that contains a quote character ... still prompts": its quoted and
 * unquoted readings differ. The quotes that wrap the whole argument do not count.
 */
const hasQuoteCharacter = (word: ShellWord): boolean =>
  /["']/.test(word.text.replace(/^(["'])([\s\S]*)\1$/, '$2'));

/** Whether a reading holds only what the kit validates: a path, the right number of arguments, no quote character. */
function isPlain(reading: Reading, cmdlet: string, content: number): boolean {
  return (
    reading.plain &&
    reading.paths.length > 0 &&
    content <= (CONTENT_ARGUMENTS[cmdlet] ?? 0) &&
    !reading.positional.some(hasQuoteCharacter)
  );
}

/** Reads the words after the cmdlet name; `plain` is false for anything the kit cannot validate. */
function readCall(cmdlet: string, words: readonly ShellWord[]): Call {
  const reading: Reading = { paths: [], positional: [], recursive: false, plain: true };
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at];
    if (word === undefined) continue;
    const named = word.value.startsWith('-');
    const kind = named ? parameterKind(cmdlet, word.value) : undefined;
    if (!named) reading.positional.push(word);
    else if (kind === undefined) reading.plain = false;
    else at += HANDLERS[kind](reading, words[at + 1]);
  }
  // With no `-Path`, the first positional argument is the path; any other is content.
  const [first] = reading.positional;
  const positionalPath = reading.paths.length === 0 && first !== undefined;
  if (positionalPath) reading.paths.push(first);
  const content = reading.positional.length - (positionalPath ? 1 : 0);
  const plain = isPlain(reading, cmdlet, content);
  return { cmdlet, paths: reading.paths, recursive: reading.recursive, plain };
}

/**
 * `Remove-Item` "gets its own check" (permission-modes.md, "Remove-Item in PowerShell"): a system
 * path or a wildcard is denied in every mode, and the working directory or a parent of it with
 * `-Recurse` needs the mode's approval. The kit does not model the denial, so such a call is simply
 * not approved by `acceptEdits` (spec/judgments.md).
 */
function removalIsOrdinary(call: Call, targets: readonly string[], paths: PathContext): boolean {
  if (call.cmdlet !== 'remove-item') return true;
  return targets.every((target) =>
    call.recursive ? !isCriticalDirectory(target, paths) : !isSystemDirectory(target, paths),
  );
}

function judgeCmdlet(command: ShellCommand, walk: Walk): SubVerdict | undefined {
  const found = cmdletCall(command);
  const cmdlet = found?.cmdlet.toLowerCase() ?? '';
  if (found === undefined || !Object.hasOwn(CONTENT_ARGUMENTS, cmdlet)) return undefined;
  const call = readCall(cmdlet, found.args);
  if (!call.plain) return undefined;
  const targets = call.paths.map((path) => operandPath(path, walk));
  const known = targets.filter((target): target is string => target !== undefined);
  if (!removalIsOrdinary(call, known, walk.paths)) return undefined;
  return judgeWrite(targets, walk);
}

/**
 * PowerShell, as far as the modes need it: split into subcommands for the rules, with the four
 * `acceptEdits` cmdlets judged on their paths. PowerShell has no read-only set in `decide`.
 */
export function powershellVerdict(
  command: string,
  paths: PathContext,
  options: ProtectedPathOptions,
  resolved: readonly string[],
): ShellVerdict {
  const { subcommands, commands, parseable } = scanCommand(command, POWERSHELL_DIALECT);
  if (!parseable || subcommands.length === 0) return UNREAD;
  const walk: Walk = {
    paths,
    options,
    resolved,
    base: posixOf(paths.cwd, paths),
    changedDirectory: false,
    usedGit: false,
  };
  const judged = commands.map((subcommand) => judgeCmdlet(subcommand, walk));
  return {
    ...UNREAD,
    editsInScope: judged.every((verdict) => verdict?.edits === true),
    writesProtected: judged.some((verdict) => verdict?.protectedWrite === true),
    writesProtectedViaLink: judged.some((verdict) => verdict?.viaLink === true),
    subcommands,
    readOnlyParts: subcommands.map(() => false),
  };
}
