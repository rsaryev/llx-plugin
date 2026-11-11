import type { SpecifierMatcher } from '../matchers.ts';
import { RESTRICTS } from '../restricts.ts';
import { POWERSHELL_DIALECT } from './dialect.ts';
import { POWERSHELL_ALIASES } from './powershell-aliases.ts';
import { matchShellRule, type Shell } from './shell.ts';
import { matchBashPattern } from './wildcard.ts';
import { readCommand, type ShellCommand, type ShellWord } from './words.ts';

/** `&` and `.` run the command named after them: `& Remove-Item x` runs `Remove-Item`. */
const CALL_OPERATORS: ReadonlySet<string> = new Set(['&', '.']);

/** `Microsoft.PowerShell.Management\Remove-Item`: a module-qualified name is the cmdlet. */
const MODULE_QUALIFIER = /^(?=[^\\]*[A-Za-z])[A-Za-z0-9_.]+\\(?=[^\\])/;

/** The word that names the command: the first, or the one after a call operator. */
const nameOf = (words: readonly ShellWord[]): ShellWord | undefined =>
  words[CALL_OPERATORS.has(words[0]?.value ?? '') ? 1 : 0];

/** The cmdlet a name stands for: unquoted, its module dropped, an alias resolved. */
function cmdletOf(name: ShellWord): string {
  const bare = name.value.replace(MODULE_QUALIFIER, '');
  return POWERSHELL_ALIASES.get(bare.toLowerCase()) ?? bare;
}

/** The cmdlet a PowerShell command runs, and the words after its name; `undefined` with no name. */
export function cmdletCall(
  command: ShellCommand,
): { readonly cmdlet: string; readonly args: readonly ShellWord[] } | undefined {
  const name = nameOf(command.words);
  if (name === undefined) return undefined;
  return { cmdlet: cmdletOf(name), args: command.words.slice(command.words.indexOf(name) + 1) };
}

/** The command with its name as the cmdlet it runs, the rest as written. */
function writtenForm(command: ShellCommand): string {
  const name = nameOf(command.words);
  return name === undefined ? command.text : `${cmdletOf(name)}${command.text.slice(name.end)}`;
}

/** The command with its name as the cmdlet it runs and its words one space apart. */
function spokenForm(command: ShellCommand): string {
  const name = nameOf(command.words);
  if (name === undefined) return command.text;
  const rest = command.words.slice(command.words.indexOf(name) + 1).map((word) => word.text);
  return [cmdletOf(name), ...rest].join(' ');
}

/** The command (or pattern) with its first word, when it names a cmdlet another way, as the cmdlet. */
export const canonicalizePowerShell = (command: string): string =>
  writtenForm(readCommand(command, POWERSHELL_DIALECT));

/** PowerShell: no wrappers, aliases resolved on both sides, case ignored. */
const POWERSHELL: Shell = {
  dialect: POWERSHELL_DIALECT,
  forms: (command, behavior) =>
    RESTRICTS[behavior] ? [writtenForm(command), spokenForm(command)] : [writtenForm(command)],
  pattern: canonicalizePowerShell,
  compare: (pattern, form) => matchBashPattern(pattern, form, { ignoreCase: true }),
  guardsExecWrappers: false,
};

/** `PowerShell(...)` rules with a command pattern. */
export const matchPowerShellRule: SpecifierMatcher = (rule, call, ctx) =>
  matchShellRule(POWERSHELL, rule, call, ctx);
