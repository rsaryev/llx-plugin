import type { AgentDefinition } from '../protocol/official.ts';
import { DOCUMENTED_TOOLS, SDK_ONLY_TOOLS } from '../protocol/tool-names.ts';
import { parseToolEntry, toolEntryMatches, type ToolEntry } from './tool-list.ts';
import { removedFromSubagent, type SubagentRun } from './tool-filters.ts';

/** The tools the main conversation offers: what a subagent inherits from (a host passes it). */
export interface ToolPool {
  readonly builtin: readonly string[];
  /** `name` is the callable name, `mcp__<server>__<tool>`. */
  readonly mcp: readonly { readonly server: string; readonly name: string }[];
}

/** An agent as far as its tools go: the two frontmatter fields of the SDK's `AgentDefinition`. */
export type AgentToolFields = Pick<AgentDefinition, 'tools' | 'disallowedTools'> & {
  readonly name: string;
};

/** errors.md, "Agent would be spawned with zero tools": the entries, by what went wrong. */
export interface ToolRefusal {
  readonly message: string;
  /** The entry matches no tool name, usually a typo. */
  readonly unrecognized: readonly string[];
  /** A real tool that subagents cannot use (a background subagent keeps fewer). */
  readonly notAvailableToSubagents: readonly string[];
  /** Valid, but no tool in the session matches it (no such MCP server, `Agent` at the depth limit). */
  readonly matchedNoTools: readonly string[];
}

/** What the `Agent` tool may spawn: a list of types, any type, or none (without the tool). */
export type SpawnTypes = readonly string[] | 'any' | 'none';

export type ToolsOutcome =
  | {
      readonly ok: true;
      readonly tools: readonly string[];
      /** The subagent types the `Agent` tool may spawn; `none` without the tool. */
      readonly spawnTypes: SpawnTypes;
    }
  | { readonly ok: false; readonly refusal: ToolRefusal };

type Group = keyof Omit<ToolRefusal, 'message'>;
const GROUP_LABELS: { readonly [G in Group]: string } = {
  unrecognized: 'unrecognized',
  notAvailableToSubagents: 'not available to subagents',
  matchedNoTools: 'matched no tools in this session',
};
const GROUPS = ['unrecognized', 'notAvailableToSubagents', 'matchedNoTools'] as const;

const KNOWN_TOOLS: ReadonlySet<string> = new Set([...DOCUMENTED_TOOLS, ...SDK_ONLY_TOOLS, 'Agent']);

const poolNames = (pool: ToolPool): string[] => [
  ...pool.builtin,
  ...pool.mcp.map((tool) => tool.name),
];

/** The tools "available to subagents": the pool minus the filters. MCP tools are never filtered. */
function availableTo(pool: ToolPool, run: SubagentRun): string[] {
  const builtin = pool.builtin.filter((tool) => !removedFromSubagent(tool, run));
  return [...builtin, ...pool.mcp.map((tool) => tool.name)];
}

/** Which group of the refusal an entry that matched nothing falls into. */
function groupOf(entry: ToolEntry, pool: ToolPool, run: SubagentRun): Group {
  const { name } = entry;
  // `Agent` and any glob or MCP name are valid shapes: "If you list `Agent`, the message reports it under the next group".
  if (entry.spawn !== undefined || name.includes('*') || name.startsWith('mcp__')) {
    return 'matchedNoTools';
  }
  if (!KNOWN_TOOLS.has(name) && !pool.builtin.includes(name)) return 'unrecognized';
  return removedFromSubagent(name, run) ? 'notAvailableToSubagents' : 'matchedNoTools';
}

function refuse(
  agent: AgentToolFields,
  raw: readonly string[],
  pool: ToolPool,
  run: SubagentRun,
): ToolsOutcome {
  const groups: { [G in Group]: string[] } = {
    unrecognized: [],
    notAvailableToSubagents: [],
    matchedNoTools: [],
  };
  for (const text of raw) groups[groupOf(parseToolEntry(text), pool, run)].push(text);
  const parts = GROUPS.filter((group) => groups[group].length > 0).map(
    (group) => `${GROUP_LABELS[group]} [${groups[group].join(', ')}]`,
  );
  const message = `Agent '${agent.name}' would be spawned with zero tools — refusing. Its tools list resolved to nothing: ${parts.join('; ')}. Fix the agent's tools frontmatter or pass a different subagent_type.`;
  return { ok: false, refusal: { message, ...groups } };
}

/** Which subagent types `Agent` may spawn: a type list in a subagent definition is ignored. */
function spawnTypesOf(
  entries: readonly ToolEntry[] | undefined,
  tools: readonly string[],
  run: SubagentRun,
): 'any' | 'none' | readonly string[] {
  if (!tools.includes('Agent')) return 'none';
  if (!run.asMainThread || entries === undefined) return 'any';
  const lists = entries.flatMap((entry) => (entry.spawn === undefined ? [] : [entry.spawn]));
  if (lists.includes('any')) return 'any';
  return [...new Set(lists.flat())];
}

const HANDBACK = 'SubagentHandback';
const dedupe = (names: readonly string[]): string[] => [...new Set(names)];

const SEARCH_TOOLS = ['Glob', 'Grep'];

/**
 * tools-reference.md, "Glob tool behavior": "A subagent lists `Glob` or `Grep` in its `tools` field
 * and leaves out `Bash`. The listed tools come back for that subagent", whether or not the session
 * has them. A glob that covers `Bash` counts as listing it.
 */
function restoredSearchTools(entries: readonly ToolEntry[] | undefined): string[] {
  if (entries === undefined) return [];
  const lists = (tool: string): boolean =>
    entries.some((entry) => toolEntryMatches(entry, tool, 'allow'));
  return lists('Bash') ? [] : SEARCH_TOOLS.filter(lists);
}

/** The tools a subagent could be given: the pool with the restored search tools, filtered; `matchable` adds the handback the host grants. */
function candidatesOf(agent: AgentToolFields, pool: ToolPool, run: SubagentRun) {
  const restored = restoredSearchTools(agent.tools?.map(parseToolEntry));
  const available = availableTo({ ...pool, builtin: dedupe([...pool.builtin, ...restored]) }, run);
  // The host grants `SubagentHandback` (`SubagentRun.handback`), so an entry naming it matches.
  return { available, matchable: run.handback === true ? [...available, HANDBACK] : available };
}

function resolveSubagent(agent: AgentToolFields, pool: ToolPool, run: SubagentRun): ToolsOutcome {
  const { available, matchable } = candidatesOf(agent, pool, run);
  const denied = (agent.disallowedTools ?? []).map(parseToolEntry);
  const isDenied = (tool: string): boolean =>
    denied.some((entry) => toolEntryMatches(entry, tool, 'deny'));
  const entries = agent.tools?.map(parseToolEntry);
  // What each entry names in the pool, before `disallowedTools` takes its share away: a tool in
  // both fields is removed, and an entry it emptied still matched (so it never refuses).
  const matched = (entries ?? []).map((entry) =>
    matchable.filter((tool) => toolEntryMatches(entry, tool, 'allow')),
  );
  if (matched.length > 0 && matched.every((m) => m.length === 0)) {
    return refuse(agent, agent.tools ?? [], pool, run);
  }
  const listed = entries === undefined ? available : matched.flat();
  const tools = dedupe(listed).filter((tool) => !isDenied(tool));
  const granted = run.handback === true ? dedupe([...tools, HANDBACK]) : tools;
  return { ok: true, tools: granted, spawnTypes: spawnTypesOf(entries, tools, run) };
}

/** A fork has the main conversation's exact pool: no definition narrows it, nothing is refused. */
function resolveFork(_agent: AgentToolFields, pool: ToolPool, run: SubagentRun): ToolsOutcome {
  const tools = poolNames(pool);
  const spawns = tools.includes('Agent') && !run.atDepthLimit;
  return { ok: true, tools, spawnTypes: spawns ? 'any' : 'none' };
}

type Resolver = (agent: AgentToolFields, pool: ToolPool, run: SubagentRun) => ToolsOutcome;
const RESOLVERS: { readonly [K in SubagentRun['kind']]: Resolver } = {
  subagent: resolveSubagent,
  fork: resolveFork,
};

/**
 * The tools a subagent gets (sub-agents.md, "Available tools" and "Restrict which tools a subagent
 * can use"; tools-reference.md, "Agent tool behavior"), or the refusal Claude Code gives when the
 * `tools` list resolves to nothing (errors.md). Pure over the definition's two fields, the pool the
 * host offers and how the run starts.
 */
export function resolveSubagentTools(
  agent: AgentToolFields,
  pool: ToolPool,
  run: SubagentRun,
): ToolsOutcome {
  return RESOLVERS[run.kind](agent, pool, run);
}
