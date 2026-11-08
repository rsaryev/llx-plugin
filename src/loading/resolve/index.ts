/**
 * Variable substitution for plugin components (plugins/manifest-reference.md, "Environment
 * variables"): the three path variables, `${user_config.KEY}`, `${VAR}`, and what differs per
 * component. Hooks, skills, MCP, LSP and monitors resolve their fields through this folder and
 * write no placeholder code of their own (docs/ARCHITECTURE.md, "Homes shared between streams").
 */
export { pluginDataId } from './data-id.ts';
export { substituteDeep, type DeepSubstituted, type ValuePath } from './deep.ts';
export {
  LSP_DEFAULTS,
  resolveLspServer,
  type LspResolution,
  type ResolvedLspServer,
} from './lsp.ts';
export {
  didChangeConfigurationOf,
  initializeOptionsOf,
  languageIdFor,
  lspExtensionConflicts,
  lspRestartDecision,
  type DidChangeConfiguration,
  type LanguageRoute,
  type RestartDecision,
} from './lsp-runtime.ts';
export { substituteContent } from './content.ts';
export { exportedEnvironment } from './exported-environment.ts';
export {
  resolveHookCommand,
  type HookCommandHandler,
  type HookCommandOptions,
  type HookCommandResolution,
  type ResolvedHookCommand,
} from './hook-command.ts';
export {
  headersHelperEnvironment,
  mcpServerKey,
  resolveMcpServer,
  type McpResolution,
  type ResolvedMcpServer,
} from './mcp.ts';
export { monitorsToStart, type MonitorEvent, type MonitorMode } from './monitor-trigger.ts';
export { resolveMonitor, type MonitorResolution, type ResolvedMonitor } from './monitor.ts';
export { HOOK_GUARD } from './shell-guard-hook.ts';
export { MONITOR_GUARD } from './shell-guard-monitor.ts';
export { HEADERS_HELPER_GUARD, rejectUserConfigInShell, type ShellGuard } from './shell-guard.ts';
export {
  OPTION_VARIABLES,
  VARIABLE_COMPONENTS,
  VARIABLE_FIELDS,
  type ComponentVariables,
  type ExportedVariable,
  type VariableComponent,
  type VariableField,
} from './field-map.ts';
export type {
  EnvironmentExpansion,
  FieldPolicy,
  PathRendering,
  SubstitutionScope,
  UserConfigPolicy,
} from './scope.ts';
export {
  SENSITIVE_PLACEHOLDER,
  substituter,
  substituteTemplate,
  type Substituted,
  type Substituter,
  type TokenReference,
} from './substitute.ts';
export {
  SURFACE_COMPONENT,
  SURFACE_POLICY,
  SURFACES,
  substituteSurface,
  type Surface,
} from './surfaces.ts';
export {
  optionEnvironment,
  optionEnvName,
  referencesUserConfig,
  userConfigText,
  userConfigValue,
  type ResolvedUserConfig,
  type UserConfigValue,
} from './user-config.ts';
export {
  isPluginVariable,
  PLUGIN_VARIABLES,
  pluginVariableValue,
  type PluginVariable,
} from './variables.ts';
