import type { HooksSettings } from '../../protocol/hook-config.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { readSurfaceLocks } from '../customization/surfaces.ts';
import { createHookGate } from './hook-gate.ts';
import { applyParentRules, type ParentSettingsContext } from './parent-settings.ts';

/**
 * What a hook session needs of the settings, as plain data: the answers `createHookPolicy` gives,
 * in the shape the hook engine's session takes (hooks.md, "Disable or remove hooks", "Hook
 * locations"). Settings is a lower layer than the engine, so the shape is structural, not a type
 * of `hooks`.
 */
export interface HookSessionGates {
  /** `effective`: `disableAllHooks` left after precedence; `managedLocked`: set in managed settings. */
  readonly disableAllHooks: { readonly effective: boolean; readonly managedLocked: boolean };
  readonly allowManagedHooksOnly: boolean;
  /** `strictPluginOnlyCustomization` locks the `hooks` surface. */
  readonly pluginOnlyHooks: boolean;
  /** The merged HTTP hook allowlists; a key no file sets is absent (no limit). */
  readonly httpPolicy: {
    readonly allowedUrls?: readonly string[];
    readonly allowedEnvVars?: readonly string[];
  };
  /** The `hooks` of each settings file that declares any, highest precedence first. */
  readonly settingsHooks: readonly { readonly scope: PolicyScope; readonly hooks: HooksSettings }[];
  /** The plugin is force-enabled in managed `enabledPlugins`, which `allowManagedHooksOnly` exempts. */
  forceEnabled(pluginId: string): boolean;
}

/** The session facts of the hook gates over these settings, under the parent-settings rules. */
export function hookSessionGates(
  view: PolicyView,
  context: ParentSettingsContext,
): HookSessionGates {
  const effective = applyParentRules(view, context);
  const pluginOnlyHooks = readSurfaceLocks(
    effective.get('strictPluginOnlyCustomization'),
  ).locked.has('hooks');
  const gate = createHookGate(effective, { hooks: pluginOnlyHooks });
  const urls = effective.get('allowedHttpHookUrls');
  const variables = effective.get('httpHookAllowedEnvVars');
  return {
    disableAllHooks: {
      effective: gate.managedDisable || gate.otherDisable,
      managedLocked: gate.managedDisable,
    },
    allowManagedHooksOnly: gate.managedOnly,
    pluginOnlyHooks,
    httpPolicy: {
      ...(urls === undefined ? {} : { allowedUrls: urls }),
      ...(variables === undefined ? {} : { allowedEnvVars: variables }),
    },
    settingsHooks: effective
      .eachFromHighest('hooks')
      .map((holder) => ({ scope: holder.scope, hooks: holder.value })),
    forceEnabled: gate.forceEnabled,
  };
}
