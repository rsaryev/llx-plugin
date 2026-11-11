/** Native diagnostics whose plugin-host contracts are reproduced by the kit (docs/SPEC.md). */
import type { Matcher, PageScope } from './scope.ts';

/** Sections of the error catalogue that concern plugins, skills, hooks, agents, MCP and settings. */
const ERRORS_KEPT = new Set([
  'Agent descriptions are over the 15.0k-token limit',
  'Hook needs quotes around a path with a space',
  "A skill, command, or workflow wasn't loaded because its name is reserved",
  'Skill or command name refused',
  'Workspace has not been trusted',
  'Remote managed settings failed to load',
  "Claude Code couldn't load your organization's settings",
  'Managed settings were not approved',
  'Managed settings need your approval',
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
]);

/** Everything outside the plugin errors and the kept sections is Claude Code's own account, API and tool failures. */
const outsideErrors: Matcher = (heading) =>
  heading.text !== 'Plugin errors' &&
  !heading.parents.includes('Plugin errors') &&
  !ERRORS_KEPT.has(heading.text.replace(/\\_/g, '_'));

export const ERROR_SCOPES: readonly PageScope[] = [
  {
    page: 'errors.md',
    category: 'cli',
    slug: 'errors',
    skip: [
      ['plugin eval is currently in early access', 'tooling'],
      [/^Skipping connection \(recent failure cached/, 'runtime'],
      [outsideErrors, 'runtime'],
    ],
  },
];
