import type { Settings } from '../../protocol/official.ts';
import type { PolicyKey } from '../../protocol/settings-keys.ts';

/**
 * The keys beyond the policy keys the kit combines: the ones settings.md names (the whole-value
 * keys, the keys that take an object, the keys whose managed value is not an override) and the
 * blocks the other areas read. A dotted name is a key inside a block that has a rule of its own
 * (settings.md, "Exceptions to managed settings precedence"); every other key of a file is
 * combined by the general rule of `merge.ts` and needs no row.
 */
export const GENERAL_KEYS = [
  'allowManagedPermissionRulesOnly',
  'autoMode',
  'autoMode.classifyAllShell',
  'availableModels',
  'crossSessionInbound',
  'disableClaudeAiConnectors',
  'enableArtifact',
  'env',
  'fallbackModel',
  'isolatePeerMachines',
  'maxEffortLevel',
  'model',
  'modelPicker',
  'permissions',
  'permissions.blockReadsOutsideWorkingDirectories',
  'permissions.blockWritesOutsideWorkingDirectories',
  'permissions.defaultMode',
  'remoteControlAtStartup',
  'sandbox',
  'sandbox.filesystem.allowManagedReadPathsOnly',
  'sandbox.network.allowManagedDomainsOnly',
  'spinnerTipsEnabled',
  'useAutoModeDuringPlan',
] as const;
export type GeneralKey = (typeof GENERAL_KEYS)[number];

/** A key the layers combine by name: a policy key or one of the general keys. */
export type SettingsKey = PolicyKey | GeneralKey;

/** The value type of each general key, from the official `Settings`, never declared again (`undefined` as `Settings` has it: the key is optional). */
export interface GeneralValues {
  readonly allowManagedPermissionRulesOnly: Settings['allowManagedPermissionRulesOnly'];
  readonly autoMode: Settings['autoMode'];
  readonly 'autoMode.classifyAllShell': NonNullable<Settings['autoMode']>['classifyAllShell'];
  readonly availableModels: Settings['availableModels'];
  readonly crossSessionInbound: Settings['crossSessionInbound'];
  readonly disableClaudeAiConnectors: Settings['disableClaudeAiConnectors'];
  readonly enableArtifact: Settings['enableArtifact'];
  readonly env: Settings['env'];
  readonly fallbackModel: Settings['fallbackModel'];
  readonly isolatePeerMachines: Settings['isolatePeerMachines'];
  readonly maxEffortLevel: Settings['maxEffortLevel'];
  readonly model: Settings['model'];
  readonly modelPicker: Settings['modelPicker'];
  readonly permissions: Settings['permissions'];
  readonly 'permissions.blockReadsOutsideWorkingDirectories': NonNullable<
    Settings['permissions']
  >['blockReadsOutsideWorkingDirectories'];
  readonly 'permissions.blockWritesOutsideWorkingDirectories': NonNullable<
    Settings['permissions']
  >['blockWritesOutsideWorkingDirectories'];
  readonly 'permissions.defaultMode': NonNullable<Settings['permissions']>['defaultMode'];
  readonly remoteControlAtStartup: Settings['remoteControlAtStartup'];
  readonly sandbox: Settings['sandbox'];
  readonly 'sandbox.filesystem.allowManagedReadPathsOnly': NonNullable<
    NonNullable<Settings['sandbox']>['filesystem']
  >['allowManagedReadPathsOnly'];
  readonly 'sandbox.network.allowManagedDomainsOnly': NonNullable<
    NonNullable<Settings['sandbox']>['network']
  >['allowManagedDomainsOnly'];
  readonly spinnerTipsEnabled: Settings['spinnerTipsEnabled'];
  readonly useAutoModeDuringPlan: Settings['useAutoModeDuringPlan'];
}

/** What `get` returns for a key: the policy key's own `Settings` type or the general key's. */
export type ValueOf<K extends SettingsKey> = K extends PolicyKey
  ? Settings[K]
  : K extends GeneralKey
    ? GeneralValues[K]
    : never;
