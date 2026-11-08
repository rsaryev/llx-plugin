import type { PermissionBehavior } from '../../protocol/official.ts';
import type { BashInput, MonitorInput } from '../../protocol/official-tools.ts';
import type { Assert, Equal } from '../../protocol/type-equality.ts';
import type { MatchContext, PermissionRule, PreparedCall } from '../types.ts';
import type { ShellDialect } from './dialect.ts';
import { requiresPromptDespitePrefixRule } from './exec-wrappers.ts';
import { splitCommand } from './split.ts';
import { textPatternOf } from './text-pattern.ts';
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

/** The field that holds the command: the SDK's `BashInput` and `MonitorInput` both have it. */
const COMMAND_FIELD = 'command' as const satisfies keyof BashInput & keyof MonitorInput;

/** @public A compile-time drift guard: `command` is a string in `BashInput`. */
export type BashCommandIsText = Assert<Equal<BashInput[typeof COMMAND_FIELD], string>>;

/** @public A compile-time drift guard: `command` is an optional string in `MonitorInput`. */
export type MonitorCommandIsText = Assert<
  Equal<NonNullable<MonitorInput[typeof COMMAND_FIELD]>, string>
>;

/**
 * The command text a call carries: `command` for Bash, Monitor and PowerShell (hooks.md). The input
 * is `unknown` because a hook or a model sends whatever it likes; the field name is the SDK's.
 */
export function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const command: unknown = Reflect.get(input, COMMAND_FIELD);
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

/** Whether a prefix (wildcard) rule of each behavior must not approve exec wrappers: allow only. */
const GUARDS_PREFIX_RULES: { readonly [B in PermissionBehavior]: boolean } = {
  allow: true,
  deny: false,
  ask: false,
};

/** Whether a text-specifier rule on a command tool covers the call's command. */
export function matchShellRule(
  shell: Shell,
  rule: PermissionRule,
  call: PreparedCall,
  ctx: MatchContext,
): boolean {
  const { behavior } = rule;
  const command = commandOf(call.input);
  const text = textPatternOf(rule);
  if (text === undefined || command === undefined) return false;
  const pattern = shell.pattern(normalizePattern(text));
  const safeEnv = new Set([...SAFE_ENVIRONMENT_VARIABLES, ...(ctx.safeEnvVars ?? [])]);
  const prefixRule =
    GUARDS_PREFIX_RULES[behavior] && shell.guardsExecWrappers && hasWildcard(pattern);
  const covered = (subcommand: string): boolean =>
    !(prefixRule && requiresPromptDespitePrefixRule(subcommand)) &&
    shell.forms(subcommand, behavior, safeEnv).some((form) => shell.compare(pattern, form));
  const split = splitCommand(command, shell.dialect);
  return COVERAGE[behavior](split.subcommands, split.parseable, covered, command);
}
