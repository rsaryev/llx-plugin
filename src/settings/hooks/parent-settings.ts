import type { PolicyKey } from '../../protocol/settings-keys.ts';
import { createPolicyView, type PolicyView } from '../view.ts';
import type { PolicyLayer } from '../layers.ts';

/**
 * The parent settings an embedding host passes in the Agent SDK's `managedSettings` option, as the
 * gateway page describes them (claude-apps-gateway.md, "How hook and skill keys in parent settings
 * take effect"): ignored on a machine with an administrator's managed settings unless the
 * administrator opted in with `parentSettingsBehavior: "merge"`, and an empty allowlist is ignored
 * when the administrator "defines `hooks` or enables a plugin". Which keys a parent may carry at all
 * is the key table's (`KEY_SPECS`), so a parent list with entries never reaches this point.
 */
export interface ParentSettingsContext {
  /** An administrator deploys managed settings on this machine, whether or not the host passed them. */
  readonly hasManagedSettings: boolean;
  /** The administrator set `parentSettingsBehavior: "merge"`. */
  readonly parentMerge: boolean;
}

/** The two allowlists a parent can carry, and only when empty. */
const PARENT_ALLOWLISTS: readonly PolicyKey[] = ['allowedHttpHookUrls', 'httpHookAllowedEnvVars'];

const isParent = (layer: PolicyLayer): boolean => layer.scope === 'parent';
const isManaged = (layer: PolicyLayer): boolean => layer.scope === 'managed';

/** Managed settings define a hook, or turn a plugin on. */
function administratorShipsHooks(view: PolicyView): boolean {
  const hooks = view
    .eachFromHighest('hooks')
    .some((holder) => holder.scope === 'managed' && Object.keys(holder.value).length > 0);
  const plugins = view
    .eachFromHighest('enabledPlugins')
    .some(
      (holder) =>
        holder.scope === 'managed' && Object.values(holder.value).some((entry) => entry !== false),
    );
  return hooks || plugins;
}

const withoutAllowlists = (layer: PolicyLayer): PolicyLayer =>
  isParent(layer)
    ? {
        scope: layer.scope,
        settings: Object.fromEntries(
          Object.entries(layer.settings).filter(
            ([name]) => !PARENT_ALLOWLISTS.some((key) => key === name),
          ),
        ),
      }
    : layer;

/**
 * The view the hook decisions read: the parent layers dropped on a machine whose administrator did
 * not opt in, and their empty allowlists dropped when the administrator ships hooks.
 */
export function applyParentRules(view: PolicyView, context: ParentSettingsContext): PolicyView {
  if (!view.layers.some(isParent)) return view;
  const administrator = context.hasManagedSettings || view.layers.some(isManaged);
  if (administrator && !context.parentMerge) {
    return createPolicyView(view.layers.filter((layer) => !isParent(layer)));
  }
  return administratorShipsHooks(view)
    ? createPolicyView(view.layers.map(withoutAllowlists))
    : view;
}
