import type { PolicyKey } from '../../protocol/settings-keys.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';

/** Where an `enabledPlugins` decision came from: a file, or the plugin's own `defaultEnabled`. */
export type DecidedBy = PolicyScope | 'defaultEnabled';

export interface EnabledDecision {
  readonly on: boolean;
  readonly decidedBy: DecidedBy;
  /** A `false` in managed settings: "blocked from installation at every scope". */
  readonly blockedByManaged: boolean;
  /** The same `false`: "hidden from the marketplace". */
  readonly hiddenInMarketplace: boolean;
}

const KEY = 'enabledPlugins' satisfies PolicyKey;

/**
 * Whether a plugin is on (settings-reference.md, `enabledPlugins`; plugins/org.md, "Control
 * matrix"). The highest file that has an entry for this id decides, so project beats user, local
 * beats project, and managed beats every other file: a managed `true` cannot be turned off and a
 * managed `false` cannot be turned on. With no entry anywhere the plugin follows its manifest
 * `defaultEnabled`, which is `true` when the manifest does not say (manifest-reference.md).
 *
 * Judgment (spec/judgments.md): the SDK also types a list or an object as an entry, which the
 * settings docs do not describe; only `false` turns a plugin off, so those read as enabled.
 */
export function enabledPlugin(
  view: PolicyView,
  id: string,
  manifestDefaultEnabled = true,
): EnabledDecision {
  const holder = view.eachFromHighest(KEY).find((each) => Object.hasOwn(each.value, id));
  if (holder === undefined) {
    return {
      on: manifestDefaultEnabled,
      decidedBy: 'defaultEnabled',
      blockedByManaged: false,
      hiddenInMarketplace: false,
    };
  }
  const on = holder.value[id] !== false;
  const blocked = holder.scope === 'managed' && !on;
  return {
    on,
    decidedBy: holder.scope,
    blockedByManaged: blocked,
    hiddenInMarketplace: blocked,
  };
}

/**
 * Whether managed settings force-enable the plugin. The id is matched whole, so a plugin of the
 * same name from another marketplace is not matched (settings-reference.md, `allowManagedHooksOnly`).
 */
export function forceEnabledByManaged(view: PolicyView, id: string): boolean {
  const decision = enabledPlugin(view, id);
  return decision.decidedBy === 'managed' && decision.on;
}
