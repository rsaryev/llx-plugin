import type { Settings } from '../../protocol/official.ts';
import type { ManagedComposition } from './compose.ts';
import { valueAt, withValueAt } from './paths.ts';

/**
 * The checks Claude Code applies "to parent-supplied values on their own" (managed-settings.md,
 * "Let an embedding host add policy"): the settings an embedding host passes through the SDK
 * `managedSettings` option (`parent`) are dropped where the managed settings Claude Code applies
 * already carry the key. `readSettingsLayer('parent', ...)` has already kept the restrictive values;
 * this decides which of those a managed value blocks.
 */
export interface ParentChecks {
  /** The managed settings Claude Code applies. */
  readonly applied: Settings;
  /** The repaired settings of every admin source that delivers a policy key, highest first. */
  readonly admins: readonly Settings[];
  /** `managedSourcesBehavior` is `"merge"`. */
  readonly merging: boolean;
}

type Block = (checks: ParentChecks) => boolean;

const isSet = (settings: Settings, path: string): boolean => valueAt(settings, path) !== undefined;

/** "Claude Code enforces the value in the managed settings it applies and blocks a parent-supplied one." */
const blockedByApplied =
  (path: string): Block =>
  ({ applied }) =>
    isSet(applied, path);

/**
 * `allowedProviders`: "a list in the selected managed source blocks a parent-supplied one, and under
 * the `managedSourcesBehavior` `"merge"` opt-in a list in any admin source does."
 */
const blockedByAllowedProviders: Block = ({ admins, merging }) =>
  merging
    ? admins.some((doc) => isSet(doc, 'allowedProviders'))
    : isSet(admins[0] ?? {}, 'allowedProviders');

/**
 * "When any admin source sets `allowManagedPermissionRulesOnly`, Claude Code drops parent-supplied
 * permission allow rules and `additionalDirectories` as it reads them, even when a higher-priority
 * source leaves the key unset."
 */
const blockedByPermissionLock: Block = ({ admins }) =>
  admins.some((doc) => valueAt(doc, 'allowManagedPermissionRulesOnly') === true);

/** The parent keys a managed value blocks, each with the condition. A parent `blockedMarketplaces` is never blocked: it adds. */
const BLOCKS: Readonly<Record<string, Block>> = {
  'permissions.allow': blockedByPermissionLock,
  'permissions.additionalDirectories': blockedByPermissionLock,
  forceLoginOrgUUID: blockedByApplied('forceLoginOrgUUID'),
  allowedMcpServers: blockedByApplied('allowedMcpServers'),
  availableModels: blockedByApplied('availableModels'),
  strictKnownMarketplaces: blockedByApplied('strictKnownMarketplaces'),
  allowedProviders: blockedByAllowedProviders,
};

export interface ParentOutcome {
  /** The parent settings that count; `undefined` when an admin source is present and does not opt in. */
  readonly settings: Settings | undefined;
  /** The keys of the host dropped, by dotted path. */
  readonly dropped: readonly string[];
}

/**
 * What a host's parent settings come to beside the managed policy. "By default, Claude Code ignores
 * parent settings whenever an admin source is present"; `parentSettingsBehavior: "merge"` in the
 * highest-priority managed source keeps them; with no admin source they are the only managed tier.
 */
export function parentSettingsOf(composition: ManagedComposition, parent: Settings): ParentOutcome {
  if (composition.hasManagedSettings && !composition.parentMerge) {
    return { settings: undefined, dropped: Object.keys(parent) };
  }
  const checks: ParentChecks = {
    applied: composition.layer.settings,
    admins: composition.admins,
    merging: composition.behavior === 'merge',
  };
  const blocked = Object.entries(BLOCKS)
    .filter(([path, block]) => isSet(parent, path) && block(checks))
    .map(([path]) => path);
  const settings = blocked.reduce<Settings>(
    (kept, path) => withValueAt(kept, path, undefined),
    parent,
  );
  return { settings, dropped: blocked };
}
