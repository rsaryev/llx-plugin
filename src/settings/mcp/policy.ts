import type { PolicyContext } from '../context.ts';
import type { PolicyView } from '../view.ts';
import { createMcpServerPolicy, type McpServerPolicy } from './allow-deny.ts';
import {
  projectServerApproval,
  type ApprovalSession,
  type McpTrust,
  type ProjectServerApproval,
} from './approvals.ts';

/** The MCP keys of the settings policy: the approval of a project's `.mcp.json` servers and the allow and deny lists. */
export interface McpSettingsPolicy {
  /**
   * The status of each server name of the folder's `.mcp.json`. The folder's trust is the context's
   * (`isFolderTrusted('project')`); a host that knows more (the configuration home, a git-tracked
   * `settings.local.json`) passes it in `trust`.
   */
  projectServerApproval(
    servers: readonly string[],
    trust?: Partial<McpTrust>,
    session?: ApprovalSession,
  ): readonly ProjectServerApproval[];
  /**
   * `allowedMcpServers`, `deniedMcpServers` and `allowManagedMcpServersOnly` over one server. A policy
   * entry expands in the context's environment; the server's own `${VAR}` expands in `live` (default:
   * the same environment).
   */
  serverPolicy(live?: Readonly<Record<string, string | undefined>>): McpServerPolicy;
}

export function createMcpSettingsPolicy(
  view: PolicyView,
  context: PolicyContext,
): McpSettingsPolicy {
  return {
    projectServerApproval: (servers, trust, session) =>
      projectServerApproval(
        servers,
        view.layers,
        { folderTrusted: context.isFolderTrusted('project'), ...trust },
        session,
      ),
    serverPolicy: (live = context.env) =>
      createMcpServerPolicy(view, { startup: context.env, live }),
  };
}
