/** The other plugin pages of the audit (scripts/spec/scope.ts): components, security, policy. */
import { NAVIGATION, type PageScope } from './scope.ts';

export const PLUGIN_SCOPES_MORE: readonly PageScope[] = [
  {
    page: 'plugins/components.md',
    category: 'layout',
    slug: 'components',
    routes: [
      { category: 'skills', heading: /^Skills$/ },
      { category: 'commands', heading: /^(Commands|Define commands in the manifest)$/ },
      {
        category: 'agents',
        heading: /^(Agents|Organize agents in subfolders|Frontmatter fields in plugin agents)$/,
      },
      {
        category: 'hooks',
        heading: /^(Hooks|When plugin hooks fire|Environment, quoting, and matching MCP tools)$/,
      },
      {
        category: 'mcp',
        heading:
          /^(MCP servers|Server names, tool names, and reloads|Include a packaged MCPB server)$/,
      },
      { category: 'lsp', heading: /^LSP servers$/ },
      { category: 'settings', heading: /^Default settings$/ },
      { category: 'themes', heading: /^Themes and output styles$/ },
      { category: 'channels', heading: /^Channels$/ },
      { category: 'monitors', heading: /^Monitors$/ },
      {
        category: 'user-config',
        heading: /^(Ask the user for configuration values|When the configuration dialog appears)$/,
      },
      {
        category: 'environment',
        heading:
          /^(Reference plugin paths and store data|Install dependencies into the data directory)$/,
      },
    ],
    skip: [['Reach users on claude.ai and Cowork', 'service'], NAVIGATION],
  },
  {
    page: 'plugins/security.md',
    category: 'trust',
    slug: 'security',
    routes: [{ category: 'policy', heading: /^Enforce plugin controls for your organization$/ }],
    skip: [
      ['Understand what a plugin can do', 'advice'],
      ['Review a plugin before you install', 'advice'],
      ['Remove a plugin you no longer trust', 'advice'],
      ['Find plugins in telemetry', 'telemetry'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/org.md',
    category: 'policy',
    slug: 'org',
    routes: [
      {
        category: 'updates',
        heading:
          /^(Turn auto-update on or off per marketplace|Turn updates off for the whole fleet|Assign release channels to user groups)$/,
      },
    ],
    skip: [
      [/^(Audit and review|OpenTelemetry events|Analytics API)$/, 'telemetry'],
      ['Confirm the rollout', 'ui'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/publish.md',
    category: 'marketplace',
    slug: 'publish',
    routes: [
      {
        category: 'updates',
        heading:
          /^(Ship updates to users|Release a new version|Tag a release|Rename or remove a plugin)$/,
      },
    ],
    skip: [
      ['Choose how to distribute', 'advice'],
      ["Submit to Anthropic's directory", 'service'],
      ['How a listed plugin reaches Claude Code users', 'service'],
      ['Declare dependencies', 'duplicate'],
      ['Tell users how to install', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/troubleshooting.md',
    category: 'install',
    slug: 'troubleshooting',
    routes: [
      { category: 'marketplace', parent: /^(Add a marketplace|Host a marketplace)$/ },
      { category: 'hooks', parent: /^Failed to load hooks from/ },
      { category: 'mcp', parent: /^Invalid MCP server config for/ },
      { category: 'lsp', parent: /^Language server doesn't start, uses too much memory/ },
      { category: 'manifest', parent: /^Build a plugin$/ },
      { category: 'policy', parent: /^Blocked by your organization$/ },
    ],
    skip: [
      [
        /^(Find where \/plugin runs|\/plugin isn't available in this environment|zsh: no such file or directory: \/plugin|The term '\/plugin' is not recognized as the name of a cmdlet|claude: command not found after claude plugin \.\.\.|Unknown command and command spellings that don't exist)$/,
        'machine',
      ],
      [
        /^(SSH authentication failed or HTTPS authentication failed|SSH host key is not in your known_hosts file|Command 'git' not found or is in an unsafe location)$/,
        'machine',
      ],
      [
        /^(Language server uses too much memory|False positive diagnostics in a monorepo)$/,
        'advice',
      ],
      [/^<directory> is not a plugin or skill folder from claude plugin eval init$/, 'tooling'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/code-intelligence.md',
    category: 'lsp',
    slug: 'intelligence',
    skip: [
      ['Install a code intelligence plugin', 'tutorial'],
      ['Read the diagnostics yourself', 'ui'],
      [
        /^(Accept or dismiss the recommendation dialog|When the recommendation dialog appears|Respond to the recommendation dialog|Turn recommendations back on)$/,
        'ui',
      ],
      ['Troubleshoot code intelligence', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/overview.md',
    category: 'install',
    slug: 'overview',
    skip: [
      ['Understand what a plugin is', 'advice'],
      ['Decide whether you need a plugin', 'advice'],
      ['Get plugins from a marketplace', 'tutorial'],
      ["Tell Anthropic's marketplaces from third-party ones", 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/cli-hints.md',
    category: 'install',
    slug: 'hints',
    skip: [['Preview what the user sees', 'ui'], NAVIGATION],
  },
  {
    page: 'plugins/anthropic-marketplaces.md',
    category: 'marketplace',
    slug: 'anthropic',
    skip: [
      ['Find plugins in the official marketplace', 'advice'],
      ["Browse and install from Anthropic's marketplaces", 'tutorial'],
      ['Add the community marketplace', 'tutorial'],
      ['Third-party marketplaces', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/relevance.md',
    category: 'marketplace',
    slug: 'relevance',
    routes: [{ category: 'policy', heading: /^Enable suggestions in managed settings$/ }],
    skip: [['Preview what the user sees', 'ui'], NAVIGATION],
  },
  {
    page: 'plugins/measure.md',
    category: 'install',
    slug: 'measure',
    skip: [
      [
        /^(Measure what a plugin costs|Lower the always-on figure|Cost shown to users before install)$/,
        'ui',
      ],
      [
        /^(Check whether a plugin is used|Not used recently in \/plugin|Find skills that never run|Unused plugins in \/doctor|Usage share in \/usage)$/,
        'ui',
      ],
      [
        /^(Measure across a fleet|OpenTelemetry events for plugin installs and use|Redacted plugin names in your backend|Query the Analytics API)$/,
        'telemetry',
      ],
      NAVIGATION,
    ],
  },
];
