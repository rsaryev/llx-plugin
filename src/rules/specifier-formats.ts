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
  ['Skill', 'skill-name'],
  ['Agent', 'subagent-type'],
  ['WebFetch', 'domain'],
  ['WebSearch', 'bare'],
]);

export const ruleFormatOf = (toolName: string): RuleFormatId =>
  FORMAT_OF_TOOL.get(toolName) ?? 'bare';

/**
 * The input fields of the command tools (hooks.md, "Bash" and "PowerShell" tool_input; Monitor's
 * own fields). A `name:value` specifier of a command rule is a parameter rule only for one of
 * these, because `git:* push` or `npm:run` is command text and the docs do not say otherwise
 * (spec/judgments.md).
 */
const COMMAND_INPUT_FIELDS: ReadonlySet<string> = new Set([
  'command',
  'description',
  'timeout',
  'timeout_ms',
  'run_in_background',
  'dangerouslyDisableSandbox',
  'ws',
]);

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

export const SPECIFIER_SYNTAX: { readonly [F in RuleFormatId]: SpecifierSyntax } = {
  command: { ...COMMAND, starIsBare: true },
  'powershell-command': COMMAND,
  'read-path': PLAIN,
  'edit-path': PLAIN,
  'skill-name': PLAIN,
  'subagent-type': PLAIN,
  domain: { ...PLAIN, domainPrefix: true },
  bare: PLAIN,
};
