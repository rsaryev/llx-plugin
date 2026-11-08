/** The Agent SDK pages whose behaviour the kit's host must match (docs/SPEC.md). */
import { TROUBLESHOOTING } from './scope-host.ts';
import { NAVIGATION, under, type Matcher, type PageScope } from './scope.ts';

/** Sections of the error catalogue that concern plugins, skills, hooks, agents, MCP and settings. */
const ERRORS_KEPT = new Set([
  'Agent descriptions are over the 15.0k-token limit',
  'Hook needs quotes around a path with a space',
  'Instruction file not loaded',
  "A skill, command, or workflow wasn't loaded because its name is reserved",
  'Skill or command name refused',
  'Workspace has not been trusted',
  'Remote managed settings failed to load',
  "Claude Code couldn't load your organization's settings",
  'Managed settings were not approved',
  'Managed settings need your approval',
  'Managed settings block the default model',
  "Managed settings don't allow this API provider",
  'MCP server is blocked by enterprise managed policy',
  'MCP server name is reserved',
  'Managed settings document could not be parsed',
  'Unable to read managed policy settings',
  'Malformed Tool(content) rule',
  'Matches no tool · check for typos',
  'Is not matched by file permission checks',
  'Has a wildcard before the rest of the command',
  'Denying Bash also turns off the PowerShell tool',
  'crossSessionInbound must be one of accept, hold, refuse',
  'Sandbox allow entries are ignored under a managed lock',
  'No such tool available',
  'MCP server is disabled',
  'Agent would be spawned with zero tools',
  'subagent_type is required',
  'Invalid --agents configuration',
  'Settings file exceeds the 2MiB limit',
  'Cannot add MCP server to the managed scope',
  'Cannot add MCP server when managed settings allow only plugin servers',
  "Can't read .mcp.json",
  'MCP server rejected the elicitation capability',
  'MCP permission prompt tool not found',
  'No shell command in a skill or command was run',
  "Output styles are saved to local settings which this session doesn't load",
]);

/** Everything outside the plugin errors and the kept sections is Claude Code's own account, API and tool failures. */
const outsideErrors: Matcher = (heading) =>
  heading.text !== 'Plugin errors' &&
  !heading.parents.includes('Plugin errors') &&
  !ERRORS_KEPT.has(heading.text.replace(/\\_/g, '_'));

export const SDK_SCOPES: readonly PageScope[] = [
  {
    page: 'errors.md',
    category: 'cli',
    slug: 'errors',
    skip: [[outsideErrors, 'runtime']],
  },
  {
    page: 'agent-sdk/plugins.md',
    category: 'install',
    slug: 'sdk',
    skip: [['Complete example', 'tutorial'], ...TROUBLESHOOTING, NAVIGATION],
  },
  {
    page: 'agent-sdk/hooks.md',
    category: 'hooks',
    slug: 'sdk',
    skip: [
      ['Examples', 'tutorial'],
      [under(/^Examples$/), 'tutorial'],
      ['Fix common issues', 'advice'],
      [under(/^Fix common issues$/), 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'agent-sdk/skills.md',
    category: 'skills',
    slug: 'sdk',
    skip: [['Create and dispatch your first skill', 'tutorial'], ...TROUBLESHOOTING, NAVIGATION],
  },
  {
    page: 'agent-sdk/subagents.md',
    category: 'agents',
    slug: 'sdk',
    skip: [
      ['Benefits of using subagents', 'advice'],
      ['Common tool combinations', 'advice'],
      ['Run Opus 5 with subagents', 'model'],
      ...TROUBLESHOOTING,
      ['Related documentation', 'navigation'],
    ],
  },
  {
    page: 'agent-sdk/permissions.md',
    category: 'permissions',
    slug: 'sdk',
    skip: [NAVIGATION],
  },
  {
    page: 'agent-sdk/mcp.md',
    category: 'mcp',
    slug: 'sdk',
    skip: [
      ['Quickstart', 'tutorial'],
      ['Examples', 'tutorial'],
      [under(/^Examples$/), 'tutorial'],
      ...TROUBLESHOOTING,
      NAVIGATION,
    ],
  },
  {
    page: 'agent-sdk/claude-code-features.md',
    category: 'settings-merge',
    slug: 'sdk',
    skip: [['Choose the right feature', 'advice'], NAVIGATION],
  },
];
