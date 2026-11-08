import { isRemoteMcpServer, type PluginMcpServer } from '../../format/mcp-config.ts';
import { mcpEndpointKey } from '../../format/mcp-endpoint.ts';

/**
 * Where an MCP server comes from, highest precedence first (mcp.md, "Scope hierarchy and
 * precedence"): the organization's `managedMcpServers` "ranks above all of these", then local,
 * project and user scope, plugin-provided servers and claude.ai connectors.
 */
export const MCP_SCOPES = ['managed', 'local', 'project', 'user', 'plugin', 'connector'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** A server some source defines, already read and with its `${VAR}` references expanded. */
export interface McpCandidate {
  readonly scope: McpScope;
  readonly name: string;
  readonly server: PluginMcpServer;
  /** `false` when the project's toggle turned it off (`applyToggles`); absent means on. */
  readonly enabled?: boolean;
}

/** What makes two candidates one server: the one thing each scope's rule picks. */
type Identify = (candidate: McpCandidate) => string;

const byName: Identify = (candidate) => `name:${JSON.stringify(candidate.name)}`;
const byEndpoint: Identify = (candidate) => mcpEndpointKey(candidate.server);

interface ScopeRule {
  /** A higher number wins. */
  readonly rank: number;
  /** How a candidate of this scope finds the server above it that it duplicates. */
  readonly identify: Identify;
  /** Whether servers of this scope hold their name against the scopes that match by name. */
  readonly holdsName: boolean;
}

/**
 * "Claude Code matches duplicates across the three scopes by name. It matches plugins and connectors
 * by endpoint." The managed servers are matched by name against the three scopes and, through the
 * endpoint every enabled server holds, hide a plugin or connector at their URL (managed-mcp.md,
 * "How provided servers load").
 */
const SCOPE_RULES: { readonly [S in McpScope]: ScopeRule } = {
  managed: { rank: 6, identify: byName, holdsName: true },
  local: { rank: 5, identify: byName, holdsName: true },
  project: { rank: 4, identify: byName, holdsName: true },
  user: { rank: 3, identify: byName, holdsName: true },
  plugin: { rank: 2, identify: byEndpoint, holdsName: false },
  connector: { rank: 1, identify: byEndpoint, holdsName: false },
};

export interface RankOptions {
  /**
   * The session is a local one in the Desktop app's Code tab: "the Code tab uses the `~/.claude.json`
   * definition" of a stdio server written in both user scope and `.mcp.json`.
   */
  readonly desktopCodeTab?: boolean;
}

/** A candidate a higher one of the same identity displaced: `/mcp` lists a hidden connector so. */
export interface HiddenMcpServer {
  readonly candidate: McpCandidate;
  readonly duplicateOf: McpCandidate;
}

export interface McpRanking {
  /** One server per identity, highest scope first; a disabled one is kept (hosts skip `enabled: false`). */
  readonly loaded: readonly McpCandidate[];
  readonly hidden: readonly HiddenMcpServer[];
}

/** Between project (4) and local (5): the user definition beats `.mcp.json` and nothing above it. */
const DESKTOP_USER_RANK = 4.5;

const isStdio = (candidate: McpCandidate): boolean => !isRemoteMcpServer(candidate.server);

const writtenInProjectToo = (user: McpCandidate, all: readonly McpCandidate[]): boolean =>
  all.some(
    (other) =>
      other.scope === 'project' && other.name === user.name && isStdio(other) && isStdio(user),
  );

function rankOf(
  candidate: McpCandidate,
  all: readonly McpCandidate[],
  options: RankOptions,
): number {
  const own = SCOPE_RULES[candidate.scope].rank;
  const desktopUser =
    options.desktopCodeTab === true &&
    candidate.scope === 'user' &&
    writtenInProjectToo(candidate, all);
  return desktopUser ? DESKTOP_USER_RANK : own;
}

/**
 * Loads each server once, from the highest-precedence source, using its whole entry (mcp.md, "Scope
 * hierarchy and precedence"). A server holds its endpoint against plugins and connectors only while
 * it is enabled ("one that points at the same URL or command as an enabled server above").
 */
export function rankMcpServers(
  candidates: readonly McpCandidate[],
  options: RankOptions = {},
): McpRanking {
  const ordered = candidates.toSorted(
    (a, b) => rankOf(b, candidates, options) - rankOf(a, candidates, options),
  );
  const held = new Map<string, McpCandidate>();
  const loaded: McpCandidate[] = [];
  const hidden: HiddenMcpServer[] = [];
  for (const candidate of ordered) {
    const rule = SCOPE_RULES[candidate.scope];
    const above = held.get(rule.identify(candidate));
    if (above !== undefined) {
      hidden.push({ candidate, duplicateOf: above });
      continue;
    }
    loaded.push(candidate);
    if (rule.holdsName) held.set(byName(candidate), candidate);
    if (candidate.enabled !== false) {
      const endpoint = byEndpoint(candidate);
      if (!held.has(endpoint)) held.set(endpoint, candidate);
    }
  }
  return { loaded, hidden };
}
