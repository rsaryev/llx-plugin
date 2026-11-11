import type { PermissionBehavior } from '../../protocol/official.ts';
import type { BashInput, MonitorInput } from '../../protocol/official-tools.ts';
import type { Assert, Equal } from '../../protocol/type-equality.ts';
import { RESTRICTS } from '../restricts.ts';
import type { MatchContext, PermissionRule, PreparedCall } from '../types.ts';
import type { ShellDialect } from './dialect.ts';
import { promptsDespitePrefixRule } from './exec-wrappers.ts';
import { scanCommand } from './split.ts';
import { textPatternOf } from './text-pattern.ts';
import { hasWildcard, normalizePattern } from './wildcard.ts';
import type { ShellCommand } from './words.ts';

/**
 * What differs between the command tools, the one matcher below reading it: how a command splits,
 * the forms of a subcommand a rule is tried against, and how a pattern is compared with one.
 */
export interface Shell {
  readonly dialect: ShellDialect;
  /** The forms of one subcommand a rule is tried against (wrappers stripped, aliases resolved). */
  readonly forms: (
    command: ShellCommand,
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
    commands: readonly ShellCommand[],
    parseable: boolean,
    covered: (command: ShellCommand) => boolean,
    whole: ShellCommand,
  ) => boolean;
} = {
  allow: (commands, parseable, covered) =>
    parseable && commands.length > 0 && commands.every(covered),
  deny: (commands, parseable, covered, whole) =>
    commands.some(covered) || (!parseable && covered(whole)),
  ask: (commands, parseable, covered, whole) =>
    commands.some(covered) || (!parseable && covered(whole)),
};

/** The variables an allow rule matches past beyond the known-safe ones (`safe-env.ts`): the host's own. */
const safeEnvOf = (ctx: MatchContext): ReadonlySet<string> => ctx.safeEnvVars ?? new Set();

/**
 * Whether a text-specifier rule on a command tool covers the call's command. A prefix (wildcard)
 * allow rule, a granting rule, must not approve exec wrappers and find actions (a Bash rule).
 */
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
  const safeEnv = safeEnvOf(ctx);
  const prefixRule = !RESTRICTS[behavior] && shell.guardsExecWrappers && hasWildcard(pattern);
  const covered = (subcommand: ShellCommand): boolean =>
    !(prefixRule && promptsDespitePrefixRule(subcommand)) &&
    shell.forms(subcommand, behavior, safeEnv).some((form) => shell.compare(pattern, form));
  const scan = scanCommand(command, shell.dialect);
  return COVERAGE[behavior](scan.commands, scan.parseable, covered, scan.whole);
}
