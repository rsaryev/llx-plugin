import type { AgentInput, BashInput, MonitorInput } from '../protocol/official-tools.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';

import { catalogEntry } from './tools/catalog.ts';
import { RULE_FORMATS, type RuleFormatId } from './tools/rule-formats.ts';

export { RULE_FORMATS, type RuleFormatId };

/** The tools the SDK no longer lists but a rule may still name: the legacy `MultiEdit` edits files like `Edit` (spec/judgments.md). */
const LEGACY_FORMAT_OF_TOOL: ReadonlyMap<string, RuleFormatId> = new Map<string, RuleFormatId>([
  ['MultiEdit', 'edit-path'],
]);

/** The format of a tool's rule specifier: its catalog entry (`tools/catalog.ts`); any other tool takes only its bare name. */
export const ruleFormatOf = (toolName: string): RuleFormatId =>
  catalogEntry(toolName)?.ruleFormat ?? LEGACY_FORMAT_OF_TOOL.get(toolName) ?? 'bare';

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

/**
 * The input fields of `Agent`: a `name:value` specifier of an Agent rule is a parameter rule only
 * for one of these, so a plugin-qualified subagent (`Agent(acme:reviewer)`) stays a name. The SDK's
 * `AgentInput` is the list, and the guard fails the typecheck when it drifts.
 */
const AGENT_INPUT_FIELDS = [
  'description',
  'prompt',
  'subagent_type',
  'model',
  'effort',
  'run_in_background',
  'name',
  'team_name',
  'mode',
  'isolation',
] as const satisfies readonly (keyof AgentInput)[];

/** @public A compile-time drift guard: a field the SDK adds to or drops from `AgentInput` fails the typecheck. */
export type AgentFieldsMatchSdk = Assert<
  Equal<(typeof AGENT_INPUT_FIELDS)[number], keyof AgentInput>
>;

/**
 * The one parameter of `Skill` the docs name (permissions.md, "Match by input parameter"): without
 * it `Skill(deploy:deploy)`, the plugin form of a synced skill (skills.md), would read as a
 * parameter rule on `deploy`. The SDK has no input type for the tool (spec/judgments.md).
 */
const SKILL_INPUT_FIELDS: ReadonlySet<string> = new Set(['skill']);

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
const AGENT_FIELDS: ReadonlySet<string> = new Set(AGENT_INPUT_FIELDS);

export const SPECIFIER_SYNTAX: { readonly [F in RuleFormatId]: SpecifierSyntax } = {
  command: { ...COMMAND, starIsBare: true },
  'powershell-command': POWERSHELL,
  'read-path': PLAIN,
  'edit-path': PLAIN,
  'skill-name': { ...PLAIN, parameterNames: SKILL_INPUT_FIELDS },
  'subagent-type': { ...PLAIN, parameterNames: AGENT_FIELDS },
  domain: { ...PLAIN, domainPrefix: true },
  bare: PLAIN,
};
