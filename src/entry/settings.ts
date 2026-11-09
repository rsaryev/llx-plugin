/** `@rsaryev/claude-plugin-kit/settings`: Settings: layers, merge, every policy key, managed settings, MCP, permission and `env` settings (docs/API.md, "Settings"). */
export {
  API_PROVIDERS,
  CROSS_SESSION_MODES,
  MARKETPLACE_KEY_ALIASES,
  MARKETPLACE_SOURCE_KINDS,
  MODEL_MATCH_MODES,
  PLUGIN_ONLY_SURFACES,
  POLICY_KEYS,
  SKILL_OVERRIDE_STATES,
  WORKFLOW_SIZES,
  type PluginOnlySurface,
  type PolicyKey,
} from '../protocol/settings-keys.ts';
export * from '../settings/index.ts';
export * from '../settings/plugins/index.ts';
export * from '../settings/marketplaces/index.ts';
export * from '../settings/hooks/index.ts';
export * from '../settings/skills/index.ts';
export * from '../settings/workflows/index.ts';
export * from '../settings/channels/index.ts';
export * from '../settings/customization/index.ts';
export * from '../settings/mcp/index.ts';
export * from '../settings/general/index.ts';
export * from '../settings/managed/index.ts';
export * from '../settings/env/index.ts';
