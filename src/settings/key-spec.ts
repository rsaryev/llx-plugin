import type { Settings } from '../protocol/official.ts';
import type { PolicyKey } from '../protocol/settings-keys.ts';
import { FALSE_FROM_ANY_SCOPE, type ManagedException } from './general/exceptions.ts';
import { GENERAL_SPECS } from './general/rows.ts';
import { GLOBAL_CONFIG_KEYS } from './general/global-config.ts';
import type { SettingsKey, ValueOf } from './general/keys.ts';
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
export interface ValueSpec<V> {
  readonly scopes: ScopeRule;
  /** Typed over the key's own value, so the view returns the key's type without a cast. */
  readonly merge: Merge<V>;
  /** The key's managed value is not an override: a restrictive value of a lower scope stays (settings.md). */
  readonly exception?: ManagedException<V>;
  /** When managed settings define the key, that value applies as-is and no other scope adds to it (`availableModels`). */
  readonly managedOwns?: boolean;
  /** Where a key inside a block, or a key two spellings share, is read in a settings object; a top-level key needs none. */
  readonly read?: (settings: Settings) => V | undefined;
  /** The names down a block to a key inside it, so the merged settings carry the value this row decided. */
  readonly path?: readonly string[];
}

export interface KeySpec<K extends PolicyKey = PolicyKey> extends ValueSpec<Settings[K]> {
  readonly repair: RepairKind;
}

/**
 * The files a key may come from. The docs' scope names are `Any file`, `Managed`, `User or managed`
 * and `User, local, or managed` (plus `--settings`); the rest are the parent settings an embedding
 * host passes (agent-sdk/typescript.md, `managedSettings`), which only the keys the gateway page
 * names accept (claude-apps-gateway.md, "How hook and skill keys in parent settings take effect").
 * `userManagedFlag` is "User or managed" plus `--settings`, for the keys whose entry says so, and
 * `repositoryCannotElevate` admits any file except a repository's with an elevating value.
 */
export const SCOPE_RULES = [
  'any',
  'anyAndParent',
  'anyAndEmptyListFromParent',
  'managed',
  'managedAndParent',
  'userOrManaged',
  'userManagedFlag',
  'userLocalManagedFlag',
  'repositoryCannotElevate',
] as const;
export type ScopeRule = (typeof SCOPE_RULES)[number];

type Admits = (scope: PolicyScope, value: unknown) => boolean;

const inScopes =
  (...scopes: readonly PolicyScope[]): Admits =>
  (scope) =>
    scopes.includes(scope);

const FILES = ['managed', 'flag', 'local', 'project', 'addDir', 'user'] as const;
/**
 * The files a checked-out repository controls, and the `permissions.defaultMode` values that do not
 * take effect from them: "`auto` and `bypassPermissions` don't take effect from project or local
 * settings; set them in user or managed settings instead" (settings.md, "A value you set is ignored").
 */
export const REPOSITORY_FILES: readonly PolicyScope[] = ['project', 'local'];
const isElevated = (value: unknown): boolean => value === 'auto' || value === 'bypassPermissions';
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
  userManagedFlag: inScopes('user', 'managed', 'flag'),
  repositoryCannotElevate: (scope, value) =>
    inScopes(...FILES)(scope, value) && !(REPOSITORY_FILES.includes(scope) && isElevated(value)),
  userLocalManagedFlag: inScopes('user', 'local', 'managed', 'flag'),
};

/**
 * The only keys a `--add-dir` directory's settings files carry (permissions.md, "Additional
 * directories grant file access, not configuration"): every other key is not loaded from there.
 */
const ONLY_KEYS: Readonly<Partial<Record<PolicyScope, readonly string[]>>> = {
  addDir: ['enabledPlugins', 'extraKnownMarketplaces'],
};

/**
 * Whether a scope carries any value of `key` at all, whatever the value: a `--add-dir` directory
 * carries two keys (permissions.md), and a global config key is carried by no settings file, only by
 * `~/.claude.json` (settings.md, "Change a setting for one session": `--settings` "can't set
 * `Managed` or `Global config` keys").
 */
export const scopeCarries = (scope: PolicyScope, key: string): boolean =>
  !GLOBAL_CONFIG_KEYS.includes(key) && (ONLY_KEYS[scope]?.includes(key) ?? true);

/** Whether `key` read from `scope` with `value` is taken into account. */
export const admits = (key: SettingsKey, scope: PolicyScope, value: unknown): boolean =>
  scopeCarries(scope, key) && ADMITS[SPECS[key].scopes](scope, value);

export const KEY_SPECS: { readonly [K in PolicyKey]: KeySpec<K> } = {
  allowManagedHooksOnly: { scopes: 'managed', merge: MERGES.highestWins, repair: 'lockBoolean' },
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
  appendPlugins: { scopes: 'userOrManaged', merge: MERGES.highestWins, repair: 'stringList' },
  blockedMarketplaces: {
    scopes: 'managedAndParent',
    merge: MERGES.unionArrays,
    repair: 'blockedSources',
  },
  channelsEnabled: { scopes: 'managed', merge: MERGES.highestWins, repair: 'boolean' },
  disableAllHooks: { scopes: 'anyAndParent', merge: MERGES.highestWins, repair: 'hooksSwitch' },
  disableBundledSkills: { scopes: 'any', merge: MERGES.highestWins, repair: 'lockBoolean' },
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
  enableWorkflows: { scopes: 'any', merge: MERGES.highestWins, repair: 'boolean' },
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
    exception: FALSE_FROM_ANY_SCOPE,
    repair: 'boolean',
  },
  syncClaudeAiSkills: {
    scopes: 'userLocalManagedFlag',
    merge: MERGES.highestWins,
    exception: FALSE_FROM_ANY_SCOPE,
    repair: 'boolean',
  },
  workflowKeywordTriggerEnabled: { scopes: 'any', merge: MERGES.highestWins, repair: 'boolean' },
  workflowSizeGuideline: { scopes: 'any', merge: MERGES.highestWins, repair: 'workflowSize' },
};

/** Every key the layers combine by name, with the row that says how. */
export const SPECS: { readonly [K in SettingsKey]: ValueSpec<ValueOf<K>> } = {
  ...KEY_SPECS,
  ...GENERAL_SPECS,
};
