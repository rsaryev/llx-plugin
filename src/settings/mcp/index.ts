/** MCP server scopes, project approvals and per-project toggles, pure over data (docs/API.md, "MCP settings"). */
export {
  MCP_SCOPES,
  rankMcpServers,
  type HiddenMcpServer,
  type McpCandidate,
  type McpRanking,
  type McpScope,
  type RankOptions,
} from './scope.ts';
export {
  claudeJsonProject,
  claudeJsonServers,
  projectFileServers,
  type McpCandidatesRead,
} from './candidates.ts';
export {
  managedServerEntries,
  type DesktopManaged,
  type ManagedServerEntries,
  type ManagedServerOptions,
} from './managed.ts';
export {
  applyToggles,
  connectorDisplayName,
  readProjectToggles,
  serverEnabled,
  type ProjectToggles,
  type ToggleSubject,
} from './toggles.ts';
export {
  PROJECT_SERVER_STATUSES,
  canPromptForProjectServers,
  projectServerApproval,
  type ApprovalSession,
  type ApprovalVia,
  type McpTrust,
  type ProjectServerApproval,
  type ProjectServerStatus,
  type PromptSession,
} from './approvals.ts';
export { createMcpSettingsPolicy, type McpSettingsPolicy } from './policy.ts';
