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
export {
  createMcpSettingsPolicy,
  type McpPlanFacts,
  type McpPolicyExtras,
  type McpSettingsPolicy,
} from './policy.ts';
export {
  MANAGED_MCP_FILE_PATHS,
  MANAGED_MCP_PLATFORMS,
  loadManagedMcpFile,
  managedMcpFilePath,
  readManagedMcpFile,
  type ManagedMcpFile,
  type ManagedMcpFileRead,
  type ManagedMcpPlatform,
} from './managed-file.ts';
export {
  MANAGED_MCP_GROUP,
  describeManagedServer,
  managedServerRemoval,
  readManagedMcpServers,
  type ManagedServerDescription,
  type ProvidedServers,
} from './managed-servers.ts';
export {
  MANAGED_DELIVERIES,
  providedServersTiming,
  reconcileManagedServers,
  type ManagedDelivery,
  type ManagedServerChanges,
  type ProvidedTiming,
  type ProvidedTimingInput,
} from './managed-timing.ts';
export { readMcpLoadSettings, type McpLoadFacts, type McpLoadSettings } from './load-settings.ts';
export {
  CHROME_BLOCKED_ERROR,
  CHROME_SERVER_NAME,
  EXCLUSIVE_ADD_ERROR,
  MCP_CONFIG_EXIT,
  PLAN_SOURCES,
  STRICT_MCP_CONFIG_EXIT,
  mcpLoadPlan,
  type BlockedServer,
  type ConfiguredCandidate,
  type McpLoadInput,
  type McpLoadPlan,
  type McpSessionFacts,
  type NamedMcpServer,
  type PlanSource,
  type PlannedServer,
} from './exclusive.ts';
export {
  createMcpServerPolicy,
  type McpBlockedBy,
  type McpPolicyEnv,
  type McpPolicySubject,
  type McpServerPolicy,
  type McpServerVerdict,
} from './allow-deny.ts';
export { MCP_SERVER_ORIGINS, type McpServerOrigin } from './origins.ts';
