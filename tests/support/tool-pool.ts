import type { PermissionMode } from '../../src/protocol/official.ts';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import type { SubagentRun } from '../../src/agents/tool-filters.ts';
import {
  resolveSubagentTools,
  type ToolPool,
  type ToolsOutcome,
} from '../../src/agents/tool-resolution.ts';

/** The tools a main conversation offers: every documented built-in and a few MCP servers. */
const mcpTool = (server: string, tool: string) => ({
  server,
  name: `mcp__${server}__${tool}`,
});

export const FULL_POOL: ToolPool = {
  builtin: DOCUMENTED_TOOLS,
  mcp: [
    mcpTool('github', 'create_issue'),
    mcpTool('github', 'get_pr'),
    mcpTool('slack', 'post_message'),
    mcpTool('reports', 'run_query'),
    mcpTool('reports__v2', 'get_totals'),
  ],
};

export const GITHUB = ['mcp__github__create_issue', 'mcp__github__get_pr'];
export const REPORTS_V2 = ['mcp__reports__v2__get_totals'];
export const MCP_NAMES = FULL_POOL.mcp.map((tool) => tool.name);

/** A foreground subagent, the plain case; `with` overrides what a test is about. */
export const run = (
  with_: Partial<SubagentRun> & { readonly permissionMode?: PermissionMode } = {},
): SubagentRun => ({
  kind: 'subagent',
  background: false,
  atDepthLimit: false,
  permissionMode: 'default',
  asMainThread: false,
  ...with_,
});

export const background = (with_: Partial<SubagentRun> = {}): SubagentRun =>
  run({ background: true, ...with_ });

type Fields = { tools?: string[]; disallowedTools?: string[] };
export const resolve = (fields: Fields, how = run(), pool = FULL_POOL): ToolsOutcome =>
  resolveSubagentTools({ name: 'code-reviewer', ...fields }, pool, how);

export function granted(outcome: ToolsOutcome): readonly string[] {
  if (!outcome.ok) throw new Error(`refused: ${outcome.refusal.message}`);
  return outcome.tools;
}
export const names = (fields: Fields, how = run(), pool = FULL_POOL) =>
  [...granted(resolve(fields, how, pool))].toSorted();
export const sorted = (list: readonly string[]) => [...list].toSorted();
