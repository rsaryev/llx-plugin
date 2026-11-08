/**
 * Where each requirement comes from: a page of the official docs, a section of it, and either the
 * rows of the section's table or its sub-headings. One rule per source; every rule must find
 * something, so a page Anthropic restructures stops the extraction instead of shrinking the spec
 * silently (docs/SPEC.md).
 */

/** The categories the compatibility report scores. */
export const CATEGORIES = [
  'manifest',
  'layout',
  'environment',
  'user-config',
  'marketplace',
  'dependencies',
  'settings',
  'skills',
  'commands',
  'agents',
  'output-styles',
  'hooks',
  'permissions',
  'mcp',
  'lsp',
  'monitors',
  'channels',
  'tools',
  'mods',
  'install',
  'updates',
  'trust',
  'policy',
  'settings-merge',
  'mcp-settings',
  'themes',
  'workflows',
  'cli',
] as const;
export type Category = (typeof CATEGORIES)[number];

interface Base {
  readonly category: Category;
  readonly page: string;
}

/** Each row of the tables under a matching section: `<prefix>.<key of the row's first cell>`. */
export interface TableRule extends Base {
  readonly section: RegExp;
  /** The header row, cells joined with " | ", when a section holds more than one table. */
  readonly header?: RegExp;
  readonly prefix: (section: RegExpExecArray) => string;
  readonly where?: (row: readonly string[]) => boolean;
}

/** Each sub-heading at `level` under a section: `<prefix>.<heading text>`. */
export interface HeadingRule extends Base {
  readonly under: RegExp;
  readonly level: number;
  readonly prefix: string;
}

const id = (prefix: string) => (): string => prefix;
const per = (prefix: string) => (match: RegExpExecArray) => `${prefix}.${match[1] ?? ''}`;

const MANIFEST = 'plugins/manifest-reference.md';
const MARKETPLACE = 'plugins/marketplace-reference.md';
const MODS = 'plugins/mods/reference.md';
const HOOKS = 'hooks.md';
const PERMISSIONS = 'permissions.md';
const PLUGIN_TOPICS = /Plugins and skills|Hooks and automation/;

export const TABLE_RULES: readonly TableRule[] = [
  { category: 'manifest', page: MANIFEST, section: /^Fields$/, prefix: id('manifest.field') },
  { category: 'commands', page: MANIFEST, section: /^commands$/, prefix: id('commands.entry') },
  { category: 'mcp', page: MANIFEST, section: /^mcpServers$/, prefix: id('mcp.source') },
  { category: 'lsp', page: MANIFEST, section: /^lspServers$/, prefix: id('lsp.field') },
  { category: 'monitors', page: MANIFEST, section: /^monitors$/, prefix: id('monitors.field') },
  {
    category: 'user-config',
    page: MANIFEST,
    section: /^User configuration$/,
    prefix: id('userConfig.field'),
  },
  {
    category: 'user-config',
    page: MANIFEST,
    section: /^Fields that run through a shell$/,
    prefix: id('userConfig.shell'),
  },
  { category: 'channels', page: MANIFEST, section: /^Channels$/, prefix: id('channels.field') },
  {
    category: 'environment',
    page: MANIFEST,
    section: /^Environment variables$/,
    prefix: id('environment.variable'),
  },
  {
    category: 'environment',
    page: MANIFEST,
    section: /^Where each variable resolves$/,
    prefix: id('environment.component'),
  },
  { category: 'layout', page: MANIFEST, section: /^Standard layout$/, prefix: id('layout') },
  {
    category: 'marketplace',
    page: MARKETPLACE,
    section: /^Top-level fields$/,
    prefix: id('marketplace.field'),
  },
  {
    category: 'marketplace',
    page: MARKETPLACE,
    section: /^Plugin entries$/,
    prefix: id('marketplace.entry'),
  },
  {
    category: 'marketplace',
    page: MARKETPLACE,
    section: /^Plugin sources$/,
    prefix: id('marketplace.source'),
  },
  {
    category: 'marketplace',
    page: MARKETPLACE,
    section: /^Fields by type$/,
    prefix: id('marketplace.sourceField'),
  },
  {
    category: 'dependencies',
    page: 'plugins/dependencies.md',
    section: /^Declare a dependency with a version constraint$/,
    prefix: id('dependencies.field'),
  },
  {
    category: 'settings',
    page: 'settings-reference.md',
    section: /^Settings index$/,
    prefix: id('settings.key'),
    where: (row) => PLUGIN_TOPICS.test(row[2] ?? ''),
  },
  {
    category: 'skills',
    page: 'skills.md',
    section: /^Frontmatter reference$/,
    prefix: id('skills.frontmatter'),
  },
  {
    category: 'skills',
    page: 'skills.md',
    section: /^Available string substitutions$/,
    prefix: id('skills.substitution'),
  },
  {
    category: 'skills',
    page: 'skills.md',
    section: /^Control who invokes a skill$/,
    prefix: id('skills.invocation'),
  },
  {
    category: 'agents',
    page: 'sub-agents.md',
    section: /^Frontmatter reference$/,
    prefix: id('agents.frontmatter'),
  },
  {
    category: 'agents',
    page: 'sub-agents.md',
    section: /^Permission modes$/,
    prefix: id('agents.permissionMode'),
  },
  {
    category: 'agents',
    page: 'sub-agents.md',
    section: /^Hooks in subagent frontmatter$/,
    prefix: id('agents.hookEvent'),
  },
  {
    category: 'output-styles',
    page: 'output-styles.md',
    section: /^Frontmatter reference$/,
    prefix: id('outputStyles.frontmatter'),
  },
  ...hookRules(),
  ...permissionRules(),
  {
    category: 'tools',
    page: 'tools-reference.md',
    section: /^Tools reference$/,
    header: /^Tool \| Description/,
    prefix: id('tools.tool'),
  },
  ...modRules(),
];

function hookRules(): TableRule[] {
  const table = (section: RegExp, prefix: TableRule['prefix'], header?: RegExp): TableRule => ({
    category: 'hooks',
    page: HOOKS,
    section,
    prefix,
    ...(header ? { header } : {}),
  });
  return [
    table(/^Matcher patterns$/, id('hooks.matcher'), /^Event \| What the matcher filters/),
    table(/^(\w+)$/, per('hooks.matcherValue'), /^Matcher \| When it fires/),
    table(/^Common fields$/, id('hooks.handler.common')),
    table(/^Command hook fields$/, id('hooks.handler.command')),
    table(/^HTTP hook fields$/, id('hooks.handler.http')),
    table(/^MCP tool hook fields$/, id('hooks.handler.mcp_tool')),
    table(/^Prompt and agent hook fields$/, id('hooks.handler.prompt')),
    table(/^Common input fields$/, id('hooks.input.common')),
    table(/^JSON output$/, id('hooks.output.common')),
    table(/^Exit code 2 behavior per event$/, id('hooks.exit2')),
    table(/^Permission update entries$/, id('hooks.permissionUpdate'), /^type \| Fields/),
    table(/^(\w+) input$/, per('hooks.input')),
    { ...table(/^(\w+)$/, per('tools.input'), /^Field \| Type \| Example/), category: 'tools' },
    table(/^(\w+) (?:decision control|output)$/, per('hooks.output')),
  ];
}

function permissionRules(): TableRule[] {
  const sections = [
    /^Permission modes$/,
    /^Match all uses of a tool$/,
    /^Use specifiers for fine-grained control$/,
    /^Match by input parameter$/,
    /^Wildcard patterns$/,
    /^What a Bash rule doesn't match$/,
    /^How path patterns match$/,
    /^How deep a pattern matches$/,
  ];
  return sections.map((section, index) => ({
    category: 'permissions',
    page: PERMISSIONS,
    section,
    prefix: id(index === 0 ? 'permissions.mode' : 'permissions.rule'),
  }));
}

// A declaration, not a const: TABLE_RULES above calls modRules() while the module loads.
function modTable(section: RegExp, prefix: string, header?: RegExp): TableRule {
  return {
    category: 'mods',
    page: MODS,
    section,
    prefix: id(prefix),
    ...(header ? { header } : {}),
  };
}

function modRules(): TableRule[] {
  return [
    modTable(/^Files$/, 'mods.file'),
    modTable(/^The hook function$/, 'mods.hookArgument'),
    modTable(/^.+$/, 'mods.event', /^Event \| Fires when/),
    modTable(/^Source and frontmatter fields on skill\.prompt$/, 'mods.skillPrompt'),
    modTable(/^Mods API methods$/, 'mods.api'),
    modTable(/^Render sites$/, 'mods.site'),
    modTable(/^Elements$/, 'mods.element'),
    modTable(/^Limits$/, 'mods.limit'),
    modTable(/^Settings and environment variables$/, 'mods.setting'),
    modTable(/^Commands$/, 'mods.command'),
  ];
}

export const HEADING_RULES: readonly HeadingRule[] = [
  { category: 'hooks', page: HOOKS, under: /^Hook events$/, level: 3, prefix: 'hooks.event' },
];
