import type { SpecifierMatcher } from '../matchers.ts';
import { POWERSHELL_DIALECT } from './dialect.ts';
import { matchShellRule, type Shell } from './shell.ts';
import { wordsOf } from './split.ts';
import { matchBashPattern } from './wildcard.ts';

/**
 * permissions.md ("PowerShell"): "Common aliases are canonicalized before matching ... so
 * `PowerShell(Get-ChildItem *)` matches `gci`, `ls`, and `dir` as well." The docs name those three
 * and no others, so the table is exactly them (spec/judgments.md); keys are lower case because
 * matching ignores case.
 */
const POWERSHELL_ALIASES: ReadonlyMap<string, string> = new Map([
  ['gci', 'Get-ChildItem'],
  ['ls', 'Get-ChildItem'],
  ['dir', 'Get-ChildItem'],
]);

/** The command with its first word, when it is an alias, replaced by the cmdlet it stands for. */
export function canonicalizePowerShell(
  command: string,
  aliases: ReadonlyMap<string, string> = POWERSHELL_ALIASES,
): string {
  const first = wordsOf(command, POWERSHELL_DIALECT)[0];
  const cmdlet = first === undefined ? undefined : aliases.get(first.text.toLowerCase());
  return first === undefined || cmdlet === undefined
    ? command
    : `${cmdlet}${command.slice(first.end)}`;
}

/** PowerShell: no wrappers, aliases resolved on both sides, case ignored. */
const POWERSHELL: Shell = {
  dialect: POWERSHELL_DIALECT,
  forms: (subcommand) => [canonicalizePowerShell(subcommand)],
  pattern: (pattern) => canonicalizePowerShell(pattern),
  compare: (pattern, form) => matchBashPattern(pattern, form, { ignoreCase: true }),
  guardsExecWrappers: false,
};

/** `PowerShell(...)` rules with a command pattern. */
export const matchPowerShellRule: SpecifierMatcher = (rule, call, ctx) =>
  matchShellRule(POWERSHELL, rule, call, ctx);
