import type { SdkMarketplaceSource, Settings } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The keys `Settings` declares by name. The interface also has an open `[k: string]: unknown`, so
 * plain `keyof Settings` is `string` and would let a misspelled key through.
 */
type DeclaredSettingsKey = keyof {
  [K in keyof Settings as string extends K ? never : number extends K ? never : K]: Settings[K];
};

/**
 * The top-level settings keys the kit resolves as policy: every key of the settings index
 * (settings-reference.md, "Settings index") that plugins, hooks, skills, workflows and channels
 * depend on, and the managed-only and fail-closed keys of managed-settings.md ("Keys only a
 * managed source can set", "Keys that fail closed"), in alphabetical order. The four `strictPluginOnlyCustomization.*` ids are surfaces
 * of the one key, not keys. Each name must be a key the official `Settings` declares, which the
 * `satisfies` checks at compile time.
 */
export const POLICY_KEYS = [
  'allowAllClaudeAiMcps',
  'allowClaudeInChromeWithManagedMcp',
  'allowManagedHooksOnly',
  'allowManagedMcpServersOnly',
  'allowManagedPermissionRulesOnly',
  'allowedChannelPlugins',
  'allowedHttpHookUrls',
  'allowedMcpServers',
  'allowedProviders',
  'appendPlugins',
  'availableModelsMatch',
  'autoMode',
  'blockedMarketplaces',
  'channelsEnabled',
  'deniedMcpServers',
  'deniedModels',
  'disableAllHooks',
  'disableAutoMode',
  'disableBundledSkills',
  'disableClaudeAiConnectors',
  'disableCommandPluginSources',
  'disableSideloadFlags',
  'disableSkillShellExecution',
  'disableWorkflows',
  'disabledMcpjsonServers',
  'enableAllProjectMcpServers',
  'enableWorkflows',
  'enabledMcpjsonServers',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'forceLoginOrgUUID',
  'forceRemoteSettingsRefresh',
  'gatewayInternalNetworks',
  'hooks',
  'httpHookAllowedEnvVars',
  'managedMcpServers',
  'managedSourcesBehavior',
  'parentSettingsBehavior',
  'permissions',
  'pluginConfigs',
  'pluginSuggestionMarketplaces',
  'pluginTrustMessage',
  'policyHelper',
  'prependPlugins',
  'skillOverrides',
  'skipAutoPermissionPrompt',
  'skipDangerousModePermissionPrompt',
  'strictKnownMarketplaces',
  'strictPluginOnlyCustomization',
  'syncClaudeAiPlugins',
  'syncClaudeAiSkills',
  'useAutoModeDuringPlan',
  'workflowKeywordTriggerEnabled',
  'workflowSizeGuideline',
  'wslInheritsWindowsSettings',
] as const satisfies readonly DeclaredSettingsKey[];

export type PolicyKey = (typeof POLICY_KEYS)[number];

/**
 * The kinds of customization `strictPluginOnlyCustomization` can lock, in the order the docs list
 * them ("`skills`, `agents`, `hooks`, and `mcp`").
 */
export const PLUGIN_ONLY_SURFACES = [
  'skills',
  'agents',
  'hooks',
  'mcp',
] as const satisfies readonly PluginOnlySurfaceUnion[];

type PluginOnlySurfaceUnion = Extract<
  NonNullable<Settings['strictPluginOnlyCustomization']>,
  readonly unknown[]
>[number];

export type PluginOnlySurface = (typeof PLUGIN_ONLY_SURFACES)[number];

/** The states a `skillOverrides` entry takes (skills.md, "Override skill visibility from settings"). */
export const SKILL_OVERRIDE_STATES = [
  'on',
  'name-only',
  'user-invocable-only',
  'off',
] as const satisfies readonly SkillOverrideState[];

type SkillOverrideState = NonNullable<Settings['skillOverrides']>[string];

/** The values of `workflowSizeGuideline` (settings-reference.md, `workflowSizeGuideline`). */
export const WORKFLOW_SIZES = [
  'unrestricted',
  'small',
  'medium',
  'large',
] as const satisfies readonly NonNullable<Settings['workflowSizeGuideline']>[];

/**
 * Every `source` kind of a marketplace source object. The docs' "Allowed source types" table names
 * eight; the SDK also types `settings` and `npm` (spec/judgments.md).
 */
export const MARKETPLACE_SOURCE_KINDS = [
  'directory',
  'file',
  'git',
  'github',
  'hostPattern',
  'npm',
  'pathPattern',
  'settings',
  'skills-dir',
  'url',
] as const satisfies readonly SdkMarketplaceSource['source'][];

/**
 * Keys Claude Code accepts under another spelling (settings-reference.md, "Marketplace key
 * aliases"): the alias on the left reads exactly as the canonical key on the right.
 */
export const MARKETPLACE_KEY_ALIASES = {
  allowedMarketplaces: 'strictKnownMarketplaces',
  additionalMarketplaces: 'extraKnownMarketplaces',
} as const satisfies Readonly<Partial<Record<DeclaredSettingsKey, PolicyKey>>>;

/** @public Drift guard: the surfaces are exactly the SDK's. */
export type PluginOnlySurfacesMatchSdk = Assert<
  Equal<(typeof PLUGIN_ONLY_SURFACES)[number], PluginOnlySurfaceUnion>
>;
/** @public Drift guard: the states are exactly the SDK's. */
export type SkillOverrideStatesMatchSdk = Assert<
  Equal<(typeof SKILL_OVERRIDE_STATES)[number], SkillOverrideState>
>;
/** @public Drift guard: the sizes are exactly the SDK's. */
export type WorkflowSizesMatchSdk = Assert<
  Equal<(typeof WORKFLOW_SIZES)[number], NonNullable<Settings['workflowSizeGuideline']>>
>;
/** @public Drift guard: the source kinds are exactly the SDK's. */
export type MarketplaceSourceKindsMatchSdk = Assert<
  Equal<(typeof MARKETPLACE_SOURCE_KINDS)[number], SdkMarketplaceSource['source']>
>;

/** The services `allowedProviders` names (settings-reference.md, `allowedProviders`). */
export const API_PROVIDERS = [
  'anthropic',
  'customEndpoint',
  'bedrock',
  'vertex',
  'foundry',
  'anthropicAws',
  'mantle',
  'gateway',
] as const satisfies readonly ApiProvider[];

type ApiProvider = NonNullable<Settings['allowedProviders']>[number];

/** The values of `availableModelsMatch` (settings-reference.md, `availableModelsMatch`). */
export const MODEL_MATCH_MODES = ['prefix', 'exact'] as const satisfies readonly NonNullable<
  Settings['availableModelsMatch']
>[];

/** The values of `crossSessionInbound` from the least to the most strict (settings-reference.md, `crossSessionInbound`). */
export const CROSS_SESSION_MODES = [
  'accept',
  'hold',
  'refuse',
] as const satisfies readonly NonNullable<Settings['crossSessionInbound']>[];

/** @public Drift guard: the providers are exactly the SDK's. */
export type ApiProvidersMatchSdk = Assert<Equal<(typeof API_PROVIDERS)[number], ApiProvider>>;
/** @public Drift guard: the match modes are exactly the SDK's. */
export type ModelMatchModesMatchSdk = Assert<
  Equal<(typeof MODEL_MATCH_MODES)[number], NonNullable<Settings['availableModelsMatch']>>
>;
/** @public Drift guard: the cross-session modes are exactly the SDK's. */
export type CrossSessionModesMatchSdk = Assert<
  Equal<(typeof CROSS_SESSION_MODES)[number], NonNullable<Settings['crossSessionInbound']>>
>;
