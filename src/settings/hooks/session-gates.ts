import type { HooksSettings } from '../../protocol/hook-config.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { readSurfaceLocks } from '../customization/surfaces.ts';
import { applyParentRules, type ParentSettingsContext } from '../managed/parent.ts';
import { createHookGate, type HookGate } from './hook-gate.ts';
import { createHttpHookPolicy, type HttpHookUrlPolicy } from './http-policy.ts';

/**
 * What a hook session needs of the settings, as plain data: the one hook decision `createHookPolicy`
 * also gives, in the shape the hook engine's session takes (hooks.md, "Disable or remove hooks", "Hook
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

/** The decision about hooks the settings make, read once from a view the parent rules were applied to. */
export interface HookDecision {
  readonly gate: HookGate;
  /** `strictPluginOnlyCustomization` locks the `hooks` surface. */
  readonly pluginOnlyHooks: boolean;
  readonly http: HttpHookUrlPolicy;
  readonly view: PolicyView;
}

export function hookDecision(effective: PolicyView): HookDecision {
  const pluginOnlyHooks = readSurfaceLocks(
    effective.get('strictPluginOnlyCustomization'),
  ).locked.has('hooks');
  return {
    gate: createHookGate(effective, { hooks: pluginOnlyHooks }),
    pluginOnlyHooks,
    http: createHttpHookPolicy(effective),
    view: effective,
  };
}

/** The decision as the hook engine's session takes it. */
function sessionGatesOf({ gate, pluginOnlyHooks, view }: HookDecision): HookSessionGates {
  const urls = view.get('allowedHttpHookUrls');
  const variables = view.get('httpHookAllowedEnvVars');
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
    settingsHooks: view
      .eachFromHighest('hooks')
      .map((holder) => ({ scope: holder.scope, hooks: holder.value })),
    forceEnabled: gate.forceEnabled,
  };
}

/** The session facts of the hook gates over these settings, under the parent-settings rules. */
export const hookSessionGates = (
  view: PolicyView,
  context: ParentSettingsContext,
): HookSessionGates => sessionGatesOf(hookDecision(applyParentRules(view, context)));
