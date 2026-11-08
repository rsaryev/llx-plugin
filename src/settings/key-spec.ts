import type { PolicyKey } from '../protocol/settings-keys.ts';
import type { PolicyScope } from './layers.ts';
import type { MergeKind } from './merge.ts';
import type { RepairKind } from './repair.ts';

/**
 * What the kit knows about each policy key, one row per key, from its entry in settings-reference.md:
 * the files it may come from (the entry's **Scope** line), how files combine (**Scope** notes and
 * settings.md, "Lists merge instead of overriding"), and what to do with an invalid value
 * (managed-settings.md, "Keys that fail closed"). The resolvers of each area read their key through
 * the view and never repeat these facts.
 */
export interface KeySpec {
  readonly scopes: ScopeRule;
  readonly merge: MergeKind;
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

export const KEY_SPECS: { readonly [K in PolicyKey]: KeySpec } = {
  allowManagedHooksOnly: { scopes: 'managed', merge: 'highestWins', repair: 'lockBoolean' },
  allowedChannelPlugins: { scopes: 'managed', merge: 'highestWins', repair: 'channelAllowlist' },
  allowedHttpHookUrls: {
    scopes: 'anyAndEmptyListFromParent',
    merge: 'unionArrays',
    repair: 'closedStringList',
  },
  appendPlugins: { scopes: 'userOrManaged', merge: 'highestWins', repair: 'stringList' },
  blockedMarketplaces: {
    scopes: 'managedAndParent',
    merge: 'unionArrays',
    repair: 'blockedSources',
  },
  channelsEnabled: { scopes: 'managed', merge: 'highestWins', repair: 'boolean' },
  disableAllHooks: { scopes: 'anyAndParent', merge: 'highestWins', repair: 'boolean' },
  disableBundledSkills: { scopes: 'any', merge: 'highestWins', repair: 'lockBoolean' },
  disableCommandPluginSources: { scopes: 'managed', merge: 'highestWins', repair: 'lockBoolean' },
  disableSkillShellExecution: {
    scopes: 'anyAndParent',
    merge: 'highestWins',
    repair: 'lockBoolean',
  },
  disableWorkflows: { scopes: 'any', merge: 'highestWins', repair: 'lockBoolean' },
  enableWorkflows: { scopes: 'any', merge: 'highestWins', repair: 'boolean' },
  enabledPlugins: { scopes: 'any', merge: 'perKeyHighestWins', repair: 'enabledPlugins' },
  extraKnownMarketplaces: {
    scopes: 'any',
    merge: 'perKeyHighestWins',
    repair: 'marketplaceMap',
  },
  hooks: { scopes: 'any', merge: 'hookGroups', repair: 'hooks' },
  httpHookAllowedEnvVars: {
    scopes: 'anyAndEmptyListFromParent',
    merge: 'unionArrays',
    repair: 'closedStringList',
  },
  pluginConfigs: { scopes: 'userOrManaged', merge: 'perKeyHighestWins', repair: 'record' },
  pluginSuggestionMarketplaces: { scopes: 'managed', merge: 'highestWins', repair: 'stringList' },
  pluginTrustMessage: { scopes: 'managed', merge: 'highestWins', repair: 'string' },
  prependPlugins: { scopes: 'userOrManaged', merge: 'highestWins', repair: 'stringList' },
  skillOverrides: { scopes: 'any', merge: 'perKeyHighestWins', repair: 'skillOverrides' },
  strictKnownMarketplaces: {
    scopes: 'managedAndParent',
    merge: 'highestWins',
    repair: 'strictSources',
  },
  strictPluginOnlyCustomization: {
    scopes: 'managedAndParent',
    merge: 'highestWins',
    repair: 'pluginOnly',
  },
  syncClaudeAiPlugins: { scopes: 'userLocalManagedFlag', merge: 'highestWins', repair: 'boolean' },
  syncClaudeAiSkills: { scopes: 'userLocalManagedFlag', merge: 'highestWins', repair: 'boolean' },
  workflowKeywordTriggerEnabled: { scopes: 'any', merge: 'highestWins', repair: 'boolean' },
  workflowSizeGuideline: { scopes: 'any', merge: 'highestWins', repair: 'workflowSize' },
};
