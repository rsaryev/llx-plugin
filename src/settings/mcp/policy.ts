import type { PolicyContext } from '../context.ts';
import type { PolicyView } from '../view.ts';
import {
  projectServerApproval,
  type ApprovalSession,
  type McpTrust,
  type ProjectServerApproval,
} from './approvals.ts';

/** The MCP keys of the settings policy: today the approval of a project's `.mcp.json` servers. */
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
  };
}
