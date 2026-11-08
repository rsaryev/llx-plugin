import { error, type PluginIssue } from '../../format/issues.ts';
import type { PermissionBehavior, PermissionMode } from '../../protocol/official.ts';
import type { DocumentedTool } from '../../protocol/tool-names.ts';
import { toolNameMatches } from '../tool-pattern.ts';
import type { PermissionRule } from '../types.ts';
import { isKnownTool } from './catalog.ts';
import { isMcpToolName, toolNameOfEntry } from './names.ts';

/**
 * A subagent definition and the session it is launched from. The facts the docs name and a host
 * knows are inputs; the kit reads no session (spec/judgments.md).
 */
export interface SubagentRequest {
  /** The definition's `name`, only for the message of a refusal. */
  readonly name?: string;
  /** The definition's `tools` field: an allowlist, entries in rule syntax. */
  readonly tools?: readonly string[];
  /** The definition's `disallowedTools` field: a denylist, same format. */
  readonly disallowedTools?: readonly string[];
  /** The tools of the main conversation (built-in and MCP), as `availableTools` returns them. */
  readonly sessionTools: readonly string[];
  /** Runs in the background: "Claude Code runs subagents in the background by default". */
  readonly background?: boolean;
  /** The subagent's `permissionMode`: `ExitPlanMode` is kept only for `plan`. */
  readonly permissionMode?: PermissionMode;
  /** The subagent is at the depth limit: `Agent` is withheld. */
  readonly atDepthLimit?: boolean;
  /** The subagent already runs in its own working directory (`isolation: worktree`): no `ExitWorktree`. */
  readonly ownWorkingDirectory?: boolean;
  /** The conditions of the `SubagentHandback` tools-table entry hold: the tool is granted regardless of the lists. */
  readonly handback?: boolean;
}

export interface SubagentTools {
  readonly tools: readonly string[];
  readonly issues: readonly PluginIssue[];
}

const SESSION = { kind: 'session' } as const;

type Gate = (request: SubagentRequest) => boolean;

const refused: Gate = () => false;

/**
 * sub-agents.md, "Available tools": "The first filter removes these tools, even when listed in the
 * `tools` field", some always and some under a condition of the subagent.
 */
const FIRST_FILTER: ReadonlyMap<string, Gate> = new Map<DocumentedTool, Gate>([
  ['Agent', (request) => request.atDepthLimit !== true],
  ['AskUserQuestion', refused],
  ['EndConversation', refused],
  ['EnterPlanMode', refused],
  ['ExitPlanMode', (request) => request.permissionMode === 'plan'],
  ['ScheduleWakeup', refused],
  ['WaitForMcpServers', refused],
  ['Workflow', refused],
  // tools-reference.md: "Not available to subagents that already run in their own working directory".
  ['ExitWorktree', (request) => request.ownWorkingDirectory !== true],
]);

/**
 * The second filter: "Apart from `Agent` and `ExitPlanMode`, which follow the first filter's
 * conditions wherever the subagent runs, a background subagent keeps every MCP tool but only these
 * built-in tools".
 */
const BACKGROUND_KEEPS: ReadonlySet<string> = new Set([
  'Agent',
  'ExitPlanMode',
  'Read',
  'Grep',
  'Glob',
  'LSP',
  'Bash',
  'PowerShell',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'Skill',
  'ToolSearch',
  'EnterWorktree',
  'ExitWorktree',
  'Monitor',
  'TaskStop',
  'SendMessage',
  'Artifact',
]);

const passesFirstFilter = (toolName: string, request: SubagentRequest): boolean =>
  FIRST_FILTER.get(toolName)?.(request) ?? true;

const isBackground = (request: SubagentRequest): boolean => request.background !== false;

const passesSecondFilter = (toolName: string, request: SubagentRequest): boolean =>
  !isBackground(request) || isMcpToolName(toolName) || BACKGROUND_KEEPS.has(toolName);

/**
 * An entry of `tools` or `disallowedTools` as a rule on a tool name: a specifier is ignored ("An
 * entry with a specifier, such as `Bash(git push *)`, still removes the whole tool"), a glob must
 * match the full name, and an `mcp__` server name covers its tools. The two fields differ for a
 * server name with `__`: an allowlist entry follows the allow rule's reading, a denylist entry the
 * deny rule's ("`mcp__reports__v2` matches none of that server's tools" in `tools`).
 */
function entryCovers(entry: string, behavior: PermissionBehavior, toolName: string): boolean {
  const name = toolNameOfEntry(entry);
  const rule: PermissionRule = {
    value: { toolName: name },
    behavior,
    source: SESSION,
    toolGlob: name.includes('*'),
    specifier: undefined,
    text: entry,
  };
  return toolNameMatches(rule, toolName);
}

const covered = (
  entries: readonly string[],
  behavior: PermissionBehavior,
  toolName: string,
): boolean => entries.some((entry) => entryCovers(entry, behavior, toolName));

const SEARCH_TOOLS = ['Glob', 'Grep'];

/**
 * tools-reference.md, "Glob tool behavior": "A subagent lists `Glob` or `Grep` in its `tools` field
 * and leaves out `Bash`. The listed tools come back for that subagent".
 */
function restoredSearchTools(request: SubagentRequest): readonly string[] {
  const { tools = [] } = request;
  return covered(tools, 'allow', 'Bash')
    ? []
    : SEARCH_TOOLS.filter((tool) => covered(tools, 'allow', tool));
}

/** The three groups of the "zero tools" message, in the order errors.md lists them. */
function groupOf(entry: string, request: SubagentRequest): string {
  const name = toolNameOfEntry(entry);
  const gate = FIRST_FILTER.get(name);
  const real = isKnownTool(name) || name.includes('*') || isMcpToolName(name);
  if (!real) return 'unrecognized';
  // "If you list `Agent`, the message reports it under the next group instead."
  const unavailable =
    name !== 'Agent' &&
    ((gate !== undefined && !gate(request)) ||
      (isBackground(request) && isKnownTool(name) && !BACKGROUND_KEEPS.has(name)));
  return unavailable ? 'not available to subagents' : 'matched no tools in this session';
}

function zeroToolsIssue(request: SubagentRequest, entries: readonly string[]): PluginIssue {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const group = groupOf(entry, request);
    groups.set(group, [...(groups.get(group) ?? []), toolNameOfEntry(entry)]);
  }
  const found = [...groups].map(([group, names]) => `${group} [${names.join(', ')}]`).join('; ');
  const who = request.name === undefined ? 'Agent' : `Agent '${request.name}'`;
  return error(
    'tools',
    `${who} would be spawned with zero tools — refusing. Its tools list resolved to nothing: ${found}. Fix the agent's tools frontmatter or pass a different subagent_type.`,
  );
}

/**
 * The tools a non-fork subagent gets (tools-reference.md, "Agent tool behavior"; sub-agents.md,
 * "Available tools", "Restrict which tools a subagent can use"): neither field inherits every tool
 * available to subagents, `tools` alone gives only those, `disallowedTools` alone every parent tool
 * but those, and with both `disallowedTools` wins. The result is always limited to the tools
 * available to subagents. A non-empty `tools` list in which no entry matches a usable tool is
 * refused with an issue (errors.md, "Agent would be spawned with zero tools"); an empty list, or a
 * list `disallowedTools` empties, launches the subagent without tools.
 */
export function resolveCatalogSubagentTools(request: SubagentRequest): SubagentTools {
  const inherited = [...new Set([...request.sessionTools, ...restoredSearchTools(request)])];
  const usable = inherited.filter(
    (tool) => passesFirstFilter(tool, request) && passesSecondFilter(tool, request),
  );
  const { tools, disallowedTools = [] } = request;
  const allowed =
    tools === undefined ? usable : usable.filter((tool) => covered(tools, 'allow', tool));
  const resolved = allowed.filter((tool) => !covered(disallowedTools, 'deny', tool));
  const granted =
    request.handback === true && !resolved.includes('SubagentHandback')
      ? [...resolved, 'SubagentHandback']
      : resolved;
  const refuses = tools !== undefined && tools.length > 0 && allowed.length === 0;
  return { tools: granted, issues: refuses ? [zeroToolsIssue(request, tools)] : [] };
}
