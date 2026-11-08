import type { PermissionBehavior } from '../../protocol/official.ts';
import type { MatchContext, PermissionRule, PreparedCall } from '../types.ts';
import type { ShellDialect } from './dialect.ts';
import { requiresPromptDespitePrefixRule } from './exec-wrappers.ts';
import { splitCommand } from './split.ts';
import { hasWildcard, normalizePattern } from './wildcard.ts';
import { SAFE_ENVIRONMENT_VARIABLES } from './wrappers.ts';

/**
 * What differs between the command tools, the one matcher below reading it: how a command splits,
 * the forms of a subcommand a rule is tried against, and how a pattern is compared with one.
 */
export interface Shell {
  readonly dialect: ShellDialect;
  /** The forms of one subcommand a rule is tried against (wrappers stripped, aliases resolved). */
  readonly forms: (
    subcommand: string,
    behavior: PermissionBehavior,
    safeEnv: ReadonlySet<string>,
  ) => readonly string[];
  /** The pattern as it is compared: aliases resolved for PowerShell. */
  readonly pattern: (pattern: string) => string;
  readonly compare: (pattern: string, form: string) => boolean;
  /** Prefix allow rules cannot approve exec wrappers and find actions (a Bash rule). */
  readonly guardsExecWrappers: boolean;
}

/** The command text a call carries: `command` for Bash, Monitor and PowerShell (hooks.md). */
export function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const command: unknown = Reflect.get(input, 'command');
  return typeof command === 'string' ? command : undefined;
}

/**
 * How many of a command's subcommands a rule must cover (permissions.md, "Compound commands"):
 * every one for an allow rule, which never matches a command it could not read to the end; any one
 * for a deny or ask rule, which also tries the whole text of a command it could not read.
 */
const COVERAGE: {
  readonly [B in PermissionBehavior]: (
    subcommands: readonly string[],
    parseable: boolean,
    covered: (subcommand: string) => boolean,
    whole: string,
  ) => boolean;
} = {
  allow: (subs, parseable, covered) => parseable && subs.length > 0 && subs.every(covered),
  deny: (subs, parseable, covered, whole) =>
    subs.some(covered) || (!parseable && covered(whole.trim())),
  ask: (subs, parseable, covered, whole) =>
    subs.some(covered) || (!parseable && covered(whole.trim())),
};

/** Whether a text-specifier rule on a command tool covers the call's command. */
export function matchShellRule(
  shell: Shell,
  rule: PermissionRule,
  call: PreparedCall,
  ctx: MatchContext,
): boolean {
  const { specifier, behavior } = rule;
  const command = commandOf(call.input);
  if (specifier?.form !== 'text' || command === undefined) return false;
  const pattern = shell.pattern(normalizePattern(specifier.pattern));
  const safeEnv = new Set([...SAFE_ENVIRONMENT_VARIABLES, ...(ctx.safeEnvVars ?? [])]);
  const prefixRule = behavior === 'allow' && shell.guardsExecWrappers && hasWildcard(pattern);
  const covered = (subcommand: string): boolean =>
    !(prefixRule && requiresPromptDespitePrefixRule(subcommand)) &&
    shell.forms(subcommand, behavior, safeEnv).some((form) => shell.compare(pattern, form));
  const split = splitCommand(command, shell.dialect);
  return COVERAGE[behavior](split.subcommands, split.parseable, covered, command);
}
