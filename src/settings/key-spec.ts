import type { Settings } from '../protocol/official.ts';
import type { PolicyKey } from '../protocol/settings-keys.ts';
import type { PolicyScope } from './layers.ts';
import { MERGES, type Merge } from './merge.ts';
import type { RepairKind } from './repair.ts';

/**
 * What the kit knows about each policy key, one row per key, from its entry in settings-reference.md:
 * the files it may come from (the entry's **Scope** line), how files combine (**Scope** notes and
 * settings.md, "Lists merge instead of overriding"), and what to do with an invalid value
 * (managed-settings.md, "Keys that fail closed"). The resolvers of each area read their key through
 * the view and never repeat these facts.
 */
export interface KeySpec<K extends PolicyKey = PolicyKey> {
  readonly scopes: ScopeRule;
  /** Typed over the key's own value, so the view returns `Settings[K]` without a cast. */
  readonly merge: Merge<Settings[K]>;
  readonly repair: RepairKind;
}

/**
 * The files a key may come from. The docs' scope names are `Any file`, `Managed`, `User or managed`
 * and `User, local, or managed` (plus `--settings`); the rest are the parent settings an embedding
 * host passes (agent-sdk/typescript.md, `managedSettings`), which only the keys the gateway page
 * names accept (claude-apps-gateway.md, "How hook and skill keys in parent settings take effect").
 */
export const SCOPE_RULES = [
  'any',
  'anyAndParent',
  'anyAndEmptyListFromParent',
  'managed',
  'managedAndParent',
  'userOrManaged',
  'userLocalManagedFlag',
] as const;
export type ScopeRule = (typeof SCOPE_RULES)[number];

type Admits = (scope: PolicyScope, value: unknown) => boolean;

const inScopes =
  (...scopes: readonly PolicyScope[]): Admits =>
  (scope) =>
    scopes.includes(scope);

const FILES = ['managed', 'flag', 'local', 'project', 'addDir', 'user'] as const;
const isEmptyList = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
const fromFilesOrParent =
  (parentValue: (value: unknown) => boolean): Admits =>
  (scope, value) =>
    inScopes(...FILES)(scope, value) || (inScopes('parent')(scope, value) && parentValue(value));

/** Which scopes (and, for one rule, which parent values) each rule admits. */
const ADMITS: { readonly [R in ScopeRule]: Admits } = {
  any: inScopes(...FILES),
  anyAndParent: inScopes(...FILES, 'parent'),
  anyAndEmptyListFromParent: fromFilesOrParent(isEmptyList),
  managed: inScopes('managed'),
  managedAndParent: inScopes('managed', 'parent'),
  userOrManaged: inScopes('user', 'managed'),
  userLocalManagedFlag: inScopes('user', 'local', 'managed', 'flag'),
};

/**
 * The only keys a `--add-dir` directory's settings files carry (permissions.md, "Additional
 * directories grant file access, not configuration"): every other key is not loaded from there.
 */
const ONLY_KEYS: Readonly<Partial<Record<PolicyScope, readonly string[]>>> = {
  addDir: ['enabledPlugins', 'extraKnownMarketplaces'],
};

/** Whether a scope carries any value of `key` at all, whatever the value (permissions.md). */
export const scopeCarries = (scope: PolicyScope, key: string): boolean =>
  ONLY_KEYS[scope]?.includes(key) ?? true;

/** Whether `key` read from `scope` with `value` is taken into account. */
export const admits = (key: PolicyKey, scope: PolicyScope, value: unknown): boolean =>
  scopeCarries(scope, key) && ADMITS[KEY_SPECS[key].scopes](scope, value);

export const KEY_SPECS: { readonly [K in PolicyKey]: KeySpec<K> } = {
  // "Scope: Managed. Users can't re-enable connectors that exclusive control suppressed"; the page
  // lists it among the keys read from every admin source (managed-settings.md), which the MCP load
  // settings do by walking the holders. A value that is no Boolean is dropped: false is the default.
  allowAllClaudeAiMcps: { scopes: 'managed', merge: MERGES.highestWins, repair: 'boolean' },
  // "Scope: Managed, from the device's own managed settings only": a layer has one `managed` scope, so
  // the device sources are the host's separate list (`ResolveInput.deviceManaged`; spec/judgments.md).
  allowClaudeInChromeWithManagedMcp: {
    scopes: 'managed',
    merge: MERGES.highestWins,
    repair: 'boolean',
  },
  allowManagedHooksOnly: { scopes: 'managed', merge: MERGES.highestWins, repair: 'lockBoolean' },
  // "Scope: Managed"; the lock itself is read from every admin source (managed-settings.md, "Keys read
  // from every admin source"), which the MCP policy does by walking the holders, not through `get`.
  allowManagedMcpServersOnly: {
    scopes: 'managed',
    merge: MERGES.highestWins,
    repair: 'lockBoolean',
  },
  allowedChannelPlugins: {
    scopes: 'managed',
    merge: MERGES.highestWins,
    repair: 'channelAllowlist',
  },
  allowedHttpHookUrls: {
    scopes: 'anyAndEmptyListFromParent',
    merge: MERGES.unionArrays,
    repair: 'closedStringList',
  },
  // "Scope: Any file. Entries from every file merge into one allowlist"; the parent settings an embedding
  // host passes take part too (spec/judgments.md).
  allowedMcpServers: {
    scopes: 'anyAndParent',
    merge: MERGES.unionArrays,
    repair: 'allowedMcpServers',
  },
  appendPlugins: { scopes: 'userOrManaged', merge: MERGES.highestWins, repair: 'stringList' },
  blockedMarketplaces: {
    scopes: 'managedAndParent',
    merge: MERGES.unionArrays,
    repair: 'blockedSources',
  },
  channelsEnabled: { scopes: 'managed', merge: MERGES.highestWins, repair: 'boolean' },
  // "Scope: Any file. Entries from every file merge into one denylist".
  deniedMcpServers: {
    scopes: 'anyAndParent',
    merge: MERGES.unionArrays,
    repair: 'deniedMcpServers',
  },
  disableAllHooks: { scopes: 'anyAndParent', merge: MERGES.highestWins, repair: 'hooksSwitch' },
  disableBundledSkills: { scopes: 'any', merge: MERGES.highestWins, repair: 'lockBoolean' },
  // "Scope: Any file ... A `true` in any settings file applies"; a boolean lock key fails closed in the
  // policy tier (managed-settings.md), which `lockBoolean` does. The MCP load settings read every holder.
  disableClaudeAiConnectors: { scopes: 'any', merge: MERGES.highestWins, repair: 'lockBoolean' },
  disableCommandPluginSources: {
    scopes: 'managed',
    merge: MERGES.highestWins,
    repair: 'lockBoolean',
  },
  disableSkillShellExecution: {
    scopes: 'anyAndParent',
    merge: MERGES.highestWins,
    repair: 'lockBoolean',
  },
  disableWorkflows: { scopes: 'any', merge: MERGES.highestWins, repair: 'lockBoolean' },
  // A rejection "in any settings file applies" (settings-reference.md); a bad entry is dropped, which
  // fails open for that one name, as every non-restrictive list does (managed-settings.md).
  disabledMcpjsonServers: { scopes: 'any', merge: MERGES.unionArrays, repair: 'stringList' },
  enableAllProjectMcpServers: { scopes: 'any', merge: MERGES.highestWins, repair: 'boolean' },
  enableWorkflows: { scopes: 'any', merge: MERGES.highestWins, repair: 'boolean' },
  enabledMcpjsonServers: { scopes: 'any', merge: MERGES.unionArrays, repair: 'stringList' },
  enabledPlugins: { scopes: 'any', merge: MERGES.perKeyHighestWins, repair: 'enabledPlugins' },
  extraKnownMarketplaces: {
    scopes: 'any',
    merge: MERGES.perKeyHighestWins,
    repair: 'marketplaceMap',
  },
  hooks: { scopes: 'any', merge: MERGES.hookGroups, repair: 'hooks' },
  httpHookAllowedEnvVars: {
    scopes: 'anyAndEmptyListFromParent',
    merge: MERGES.unionArrays,
    repair: 'closedStringList',
  },
  // "Scope: Managed ... Claude Code drops the key with a warning in user, project, and local settings";
  // "Combines the server names from every source; when two sources set the same name, applies the
  // higher-ranked source's whole entry" (managed-settings.md). The entries are read by `settings/mcp`.
  managedMcpServers: { scopes: 'managed', merge: MERGES.perKeyHighestWins, repair: 'record' },
  pluginConfigs: { scopes: 'userOrManaged', merge: MERGES.perKeyHighestWins, repair: 'record' },
  pluginSuggestionMarketplaces: {
    scopes: 'managed',
    merge: MERGES.highestWins,
    repair: 'stringList',
  },
  pluginTrustMessage: { scopes: 'managed', merge: MERGES.highestWins, repair: 'string' },
  prependPlugins: { scopes: 'userOrManaged', merge: MERGES.highestWins, repair: 'stringList' },
  skillOverrides: { scopes: 'any', merge: MERGES.perKeyHighestWins, repair: 'skillOverrides' },
  strictKnownMarketplaces: {
    scopes: 'managedAndParent',
    merge: MERGES.highestWins,
    repair: 'strictSources',
  },
  strictPluginOnlyCustomization: {
    scopes: 'managedAndParent',
    merge: MERGES.highestWins,
    repair: 'pluginOnly',
  },
  syncClaudeAiPlugins: {
    scopes: 'userLocalManagedFlag',
    merge: MERGES.highestWins,
    repair: 'boolean',
  },
  syncClaudeAiSkills: {
    scopes: 'userLocalManagedFlag',
    merge: MERGES.highestWins,
    repair: 'boolean',
  },
  workflowKeywordTriggerEnabled: { scopes: 'any', merge: MERGES.highestWins, repair: 'boolean' },
  workflowSizeGuideline: { scopes: 'any', merge: MERGES.highestWins, repair: 'workflowSize' },
};
