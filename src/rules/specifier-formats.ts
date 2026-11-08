import type { BashInput, MonitorInput } from '../protocol/official-tools.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';

/**
 * How a tool reads what follows its name inside the parentheses of a rule: the "Rule format" table
 * of tools-reference.md ("Configure tools with permission rules and hooks"). One id per format;
 * every part that differs per format (matching, syntax details) is a registry typed over
 * `RuleFormatId`, so a format added here fails the typecheck until each registry handles it.
 */
export const RULE_FORMATS = [
  'command',
  'powershell-command',
  'read-path',
  'edit-path',
  'skill-name',
  'subagent-type',
  'domain',
  'bare',
] as const;

export type RuleFormatId = (typeof RULE_FORMATS)[number];

/** The table's "Applies to" column. A tool it does not list takes only its bare name. */
const FORMAT_OF_TOOL: ReadonlyMap<string, RuleFormatId> = new Map<string, RuleFormatId>([
  ['Bash', 'command'],
  ['Monitor', 'command'],
  ['PowerShell', 'powershell-command'],
  ['Read', 'read-path'],
  ['Grep', 'read-path'],
  ['Glob', 'read-path'],
  ['LSP', 'read-path'],
  ['Edit', 'edit-path'],
  ['Write', 'edit-path'],
  ['NotebookEdit', 'edit-path'],
  ['MultiEdit', 'edit-path'],
  ['Skill', 'skill-name'],
  ['Agent', 'subagent-type'],
  ['WebFetch', 'domain'],
  ['WebSearch', 'bare'],
]);

export const ruleFormatOf = (toolName: string): RuleFormatId =>
  FORMAT_OF_TOOL.get(toolName) ?? 'bare';

/**
 * The input fields of the command tools: a `name:value` specifier of a command rule is a parameter
 * rule only for one of these, because `git:* push` or `npm:run` is command text and the docs do
 * not say otherwise (spec/judgments.md). Bash and Monitor share a rule format; their fields are
 * the SDK's `BashInput` and `MonitorInput`, and the guards below fail the typecheck when either
 * drifts. The SDK has no PowerShell input type, so PowerShell reads Bash's fields (judgment).
 */
const BASH_INPUT_FIELDS = [
  'command',
  'timeout',
  'description',
  'run_in_background',
  'dangerouslyDisableSandbox',
] as const satisfies readonly (keyof BashInput)[];

const MONITOR_INPUT_FIELDS = [
  'description',
  'timeout_ms',
  'command',
  'ws',
] as const satisfies readonly (keyof MonitorInput)[];

/** @public A compile-time drift guard: a field the SDK adds to or drops from `BashInput` fails the typecheck. */
export type BashFieldsMatchSdk = Assert<Equal<(typeof BASH_INPUT_FIELDS)[number], keyof BashInput>>;

/** @public A compile-time drift guard: a field the SDK adds to or drops from `MonitorInput` fails the typecheck. */
export type MonitorFieldsMatchSdk = Assert<
  Equal<(typeof MONITOR_INPUT_FIELDS)[number], keyof MonitorInput>
>;

const COMMAND_INPUT_FIELDS: ReadonlySet<string> = new Set([
  ...BASH_INPUT_FIELDS,
  ...MONITOR_INPUT_FIELDS,
]);
const POWERSHELL_INPUT_FIELDS: ReadonlySet<string> = new Set(BASH_INPUT_FIELDS);

/** What a format changes about reading a specifier, before any matching. */
export interface SpecifierSyntax {
  /** `domain:` opens a domain pattern (permissions.md, "WebFetch"). */
  readonly domainPrefix: boolean;
  /** `name:*` is a trailing wildcard, the `:*` suffix (permissions.md, "Wildcard patterns"). */
  readonly colonStarSuffix: boolean;
  /** `Tool(*)` is the bare tool name: documented for Bash ("`Bash(*)` is equivalent to `Bash`"). */
  readonly starIsBare: boolean;
  /** The only names `name:value` may use as a parameter rule; `undefined` is any name. */
  readonly parameterNames: ReadonlySet<string> | undefined;
}

const PLAIN: SpecifierSyntax = {
  domainPrefix: false,
  colonStarSuffix: false,
  starIsBare: false,
  parameterNames: undefined,
};
const COMMAND: SpecifierSyntax = {
  ...PLAIN,
  colonStarSuffix: true,
  parameterNames: COMMAND_INPUT_FIELDS,
};
const POWERSHELL: SpecifierSyntax = { ...COMMAND, parameterNames: POWERSHELL_INPUT_FIELDS };

export const SPECIFIER_SYNTAX: { readonly [F in RuleFormatId]: SpecifierSyntax } = {
  command: { ...COMMAND, starIsBare: true },
  'powershell-command': POWERSHELL,
  'read-path': PLAIN,
  'edit-path': PLAIN,
  'skill-name': PLAIN,
  'subagent-type': PLAIN,
  domain: { ...PLAIN, domainPrefix: true },
  bare: PLAIN,
};
