/** Claude Code's plugin format: reading and validating what a plugin folder holds. */
export { SEVERITIES, blocksLoading, type PluginIssue, type Severity } from './issues.ts';
export { readManifest, validateManifest, type ManifestResult } from './manifest.ts';
export type {
  CommandEntry,
  PluginChannel,
  PluginDependency,
  PluginManifest,
  UserConfigOption,
} from './manifest-schema.ts';
export { TRAVERSAL } from './paths.ts';
export { parseFrontmatter, type Frontmatter, type FrontmatterState } from './frontmatter.ts';
export {
  NOT_A_TABLE,
  readEnum,
  readFlag,
  readInteger,
  readList,
  readTable,
  readText,
  type FieldProblem,
  type FieldRead,
  type IntegerBounds,
  type ListOptions,
} from './frontmatter-values.ts';
export { readHooksFile, readHooksSettings, type HooksRead } from './hooks-settings.ts';
export {
  DEFAULT_TYPES_PATH,
  HOOKS_MODULE_EXTENSIONS,
  isHooksModuleName,
  isModTestFile,
  readHooksJsonModules,
  resolveTypesPath,
  type HooksModules,
} from './mod-files.ts';
export { readAgent } from './agent.ts';
export {
  agentFileName,
  agentNameProblem,
  hookAgentType,
  scopedAgentName,
  validAgentName,
} from './agent-name.ts';
export {
  AGENT_SOURCES,
  type AgentExtras,
  type AgentOrigin,
  type AgentReadResult,
  type AgentRecord,
  type AgentSource,
  type UnrecognizedField,
} from './agent-record.ts';
export {
  AGENT_COLORS,
  AGENT_FIELDS,
  AGENT_FIELD_NAMES,
  AGENT_ISOLATIONS,
  AGENT_MEMORY_SCOPES,
  PLUGIN_IGNORED_FIELDS,
  type AgentColor,
  type AgentFieldName,
  type AgentFieldSpec,
  type AgentFieldValue,
  type AgentIsolation,
  type AgentMemoryScope,
} from './agent-fields.ts';
export {
  AUTO_COMPACT_RANGE,
  type AgentCoercer,
  type AgentFieldRead,
  type CacheTtl,
} from './agent-scalars.ts';
