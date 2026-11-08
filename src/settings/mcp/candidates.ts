import type { PluginIssue } from '../../format/issues.ts';
import { readMcpConfig } from '../../format/mcp-config.ts';
import { isRecord } from '../record.ts';
import type { McpCandidate, McpScope } from './scope.ts';

export interface McpCandidatesRead {
  readonly candidates: readonly McpCandidate[];
  readonly issues: readonly PluginIssue[];
}

/** The servers of one `mcpServers` map as candidates of `scope`; an entry Claude Code drops is an issue. */
function candidatesOf(scope: McpScope, servers: unknown, origin: string): McpCandidatesRead {
  if (!isRecord(servers)) return { candidates: [], issues: [] };
  const read = readMcpConfig(servers, origin);
  return {
    candidates: Object.entries(read.servers).map(([name, server]) => ({ scope, name, server })),
    issues: read.issues,
  };
}

/** The `~/.claude.json` entry of one project (`projects["<path>"]`), as it was written. */
export function claudeJsonProject(state: unknown, projectPath: string): unknown {
  const projects = isRecord(state) ? state.projects : undefined;
  return isRecord(projects) && Object.hasOwn(projects, projectPath)
    ? projects[projectPath]
    : undefined;
}

/**
 * The user and local servers of Claude Code's state file `~/.claude.json`, already parsed by the host
 * (mcp.md, "MCP installation scopes"): the top-level `mcpServers` are user scope, "available across
 * all projects"; those under `projects["<path>"]` are local scope and load "only in the project where
 * you added it". The host names the project path the way Claude Code keys it.
 */
export function claudeJsonServers(state: unknown, projectPath: string): McpCandidatesRead {
  const origin = '~/.claude.json';
  const local = claudeJsonProject(state, projectPath);
  const reads = [
    candidatesOf(
      'local',
      isRecord(local) ? local.mcpServers : undefined,
      `${origin} (${projectPath})`,
    ),
    candidatesOf('user', isRecord(state) ? state.mcpServers : undefined, origin),
  ];
  return {
    candidates: reads.flatMap((read) => read.candidates),
    issues: reads.flatMap((read) => read.issues),
  };
}

/**
 * The servers of a project's `.mcp.json`, already parsed (mcp.md, "Project scope"): project scope.
 * An absent file (`undefined`) holds none. They load only once approved (`projectServerApproval`); this reads, it does not decide.
 */
export function projectFileServers(mcpJson: unknown): McpCandidatesRead {
  if (mcpJson === undefined) return { candidates: [], issues: [] };
  const read = readMcpConfig(mcpJson, '.mcp.json');
  return {
    candidates: Object.entries(read.servers).map(([name, server]) => ({
      scope: 'project',
      name,
      server,
    })),
    issues: read.issues,
  };
}
