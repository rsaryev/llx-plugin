import type { Settings } from '../../protocol/official.ts';
import type { PolicyKey } from '../../protocol/settings-keys.ts';
import type { PolicyLayer } from '../layers.ts';
import { valueAt, withValueAt } from '../paths.ts';
import { createPolicyView, type PolicyView } from '../view.ts';
import type { ManagedComposition } from './compose.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * The parent settings an embedding host passes through the Agent SDK's `managedSettings` option
 * (managed-settings.md, "Let an embedding host add policy"; claude-apps-gateway.md, "How hook and
 * skill keys in parent settings take effect"). One rule, applied where the layers are read
 * (`parentSettingsOf`) and again over any view a host built itself (`applyParentRules`):
 *
 * - "By default, Claude Code ignores parent settings whenever an admin source is present";
 *   `parentSettingsBehavior: "merge"` in the highest-priority managed source keeps them.
 * - The checks Claude Code applies "to parent-supplied values on their own": a value of the managed
 *   settings it applies blocks the parent's for the keys below.
 * - An empty parent allowlist is ignored when the administrator "defines `hooks` or enables a plugin".
 *
 * Which keys a parent may carry at all is the key table's (`KEY_SPECS`).
 */
export interface ParentSettingsContext {
  /** An administrator deploys managed settings on this machine, whether or not the host passed them. */
  readonly hasManagedSettings: boolean;
  /** The administrator set `parentSettingsBehavior: "merge"`. */
  readonly parentMerge: boolean;
}

/** What the admin sources say, which decides what of the parent settings stays. */
interface ParentChecks {
  /** The managed settings Claude Code applies. */
  readonly applied: Settings;
  /** The settings of every admin source that delivers a policy key, highest first. */
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

/** The two allowlists a parent can carry, and only when empty. */
const PARENT_ALLOWLISTS: readonly PolicyKey[] = ['allowedHttpHookUrls', 'httpHookAllowedEnvVars'];

/** Managed settings define a hook, or turn a plugin on. */
const shipsHooks = (admins: readonly Settings[]): boolean =>
  admins.some(
    ({ hooks, enabledPlugins }) =>
      (isRecord(hooks) && Object.keys(hooks).length > 0) ||
      (isRecord(enabledPlugins) && Object.values(enabledPlugins).some((on) => on !== false)),
  );

const blockedByShippedHooks: Block = ({ admins }) => shipsHooks(admins);

/** The parent keys the admin tier blocks, each with the condition. A parent `blockedMarketplaces` is never blocked: it adds. */
const BLOCKS: Readonly<Record<string, Block>> = {
  'permissions.allow': blockedByPermissionLock,
  'permissions.additionalDirectories': blockedByPermissionLock,
  forceLoginOrgUUID: blockedByApplied('forceLoginOrgUUID'),
  allowedMcpServers: blockedByApplied('allowedMcpServers'),
  availableModels: blockedByApplied('availableModels'),
  strictKnownMarketplaces: blockedByApplied('strictKnownMarketplaces'),
  allowedProviders: blockedByAllowedProviders,
  ...Object.fromEntries(PARENT_ALLOWLISTS.map((key) => [key, blockedByShippedHooks])),
};

export interface ParentOutcome {
  /** The parent settings that count; `undefined` when an admin source is present and does not opt in. */
  readonly settings: Settings | undefined;
  /** The keys of the host dropped, by dotted path. */
  readonly dropped: readonly string[];
}

/** The one rule: what of `parent` stays beside the admin sources. */
function keptOf(
  parent: Settings,
  checks: ParentChecks,
  context: ParentSettingsContext,
): ParentOutcome {
  if (context.hasManagedSettings && !context.parentMerge) {
    return { settings: undefined, dropped: Object.keys(parent) };
  }
  const dropped = Object.entries(BLOCKS)
    .filter(([path, block]) => isSet(parent, path) && block(checks))
    .map(([path]) => path);
  const settings = dropped.reduce<Settings>(
    (kept, path) => withValueAt(kept, path, undefined),
    parent,
  );
  return { settings, dropped };
}

/** What a host's parent settings come to beside the managed tier the kit composed. */
export const parentSettingsOf = (
  composition: ManagedComposition,
  parent: Settings,
): ParentOutcome =>
  keptOf(
    parent,
    {
      applied: composition.layer.settings,
      admins: composition.admins,
      merging: composition.behavior === 'merge',
    },
    composition,
  );

const isParent = (layer: PolicyLayer): boolean => layer.scope === 'parent';

/**
 * The view every area reads: the parent layers under the same rule, over the managed layers of the
 * view. A view with nothing to drop is returned as it is, so applying the rule again costs nothing; a
 * kept parent layer keeps its `invalid` keys, whose fail-closed floors still apply.
 */
export function applyParentRules(view: PolicyView, context: ParentSettingsContext): PolicyView {
  if (!view.layers.some(isParent)) return view;
  const admins = view.layers
    .filter((layer) => layer.scope === 'managed')
    .map((one) => one.settings);
  const checks: ParentChecks = { applied: admins[0] ?? {}, admins, merging: false };
  const present = {
    ...context,
    hasManagedSettings: context.hasManagedSettings || admins.length > 0,
  };
  let changed = false;
  const layers = view.layers.flatMap((layer): PolicyLayer[] => {
    if (!isParent(layer)) return [layer];
    const { settings, dropped } = keptOf(layer.settings, checks, present);
    if (settings !== undefined && dropped.length === 0) return [layer];
    changed = true;
    return settings === undefined ? [] : [{ ...layer, settings }];
  });
  return changed ? createPolicyView(layers) : view;
}
