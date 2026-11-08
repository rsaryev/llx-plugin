import { forceEnabledByManaged } from '../plugins/enabled-plugins.ts';
import { createCommandSourcePolicy } from '../marketplaces/command-sources.ts';
import type { PolicyView } from '../view.ts';
import { stopsOf } from './origin-stops.ts';
import {
  HOOK_BLOCK_REASONS,
  type HookBlockReason,
  type ForceEnabled,
  type HookSource,
  type HookVerdict,
  type Stops,
} from './origins.ts';

/**
 * What the customization package decides and this one only consumes: whether the `hooks` surface of
 * `strictPluginOnlyCustomization` is locked (settings-reference.md, `strictPluginOnlyCustomization.hooks`).
 * Taking it as an input keeps the hook locks from depending on the package that owns that key.
 */
export interface HookLocks {
  readonly hooks: boolean;
}

/** The three decisions about hooks that the settings make, read once from the view. */
export interface HookGate {
  runs(origin: HookSource): HookVerdict;
  /** `disableAllHooks` is `true` after precedence, in managed settings. */
  readonly managedDisable: boolean;
  /**
   * `disableAllHooks` is `true` after precedence, in any other file, or the SDK's `managedSettings`
   * carries it as `true`, which is a lock and not a ranked value.
   */
  readonly otherDisable: boolean;
  /** `allowManagedHooksOnly` is `true`, or `managedSettings` carries `disableAllHooks: true`, which binds as it. */
  readonly managedOnly: boolean;
  readonly forceEnabled: ForceEnabled;
}

/** Whether each lock stops a hook with these stops, in the order the reason is reported. */
type Applies = (
  stops: Stops,
  gate: Omit<HookGate, 'runs'>,
  locks: HookLocks,
  commands: boolean,
) => boolean;

/**
 * The reason named when several locks stop one hook. The docs do not rank them (spec/judgments.md):
 * a plugin that is never loaded comes first, then the widest setting, then the narrower ones.
 */
const APPLIES: { readonly [R in HookBlockReason]: Applies } = {
  commandSourceDisabled: (stops, _gate, _locks, commands) => commands && stops.commandSource,
  disableAllHooks: (stops, gate) =>
    (gate.managedDisable && stops.managedDisable) || (gate.otherDisable && stops.otherDisable),
  allowManagedHooksOnly: (stops, gate) => gate.managedOnly && stops.managedOnly,
  'strictPluginOnlyCustomization.hooks': (stops, _gate, locks) => locks.hooks && stops.pluginOnly,
};

/**
 * `disableAllHooks: true` in the SDK's `managedSettings` "binds as `allowManagedHooksOnly: true`"
 * (the SDK's `managedSettings` option), so it is a lock that no `disableAllHooks` of another file can
 * lift. A `false` there is an ordinary value and ranks like any other.
 */
const bindsAsLock = (holder: { readonly scope: string; readonly value: boolean }): boolean =>
  holder.scope === 'parent' && holder.value;

export function createHookGate(view: PolicyView, locks: HookLocks): HookGate {
  const holders = view.eachFromHighest('disableAllHooks');
  const ranked = holders.find((holder) => !bindsAsLock(holder));
  const parentLock = holders.some(bindsAsLock);
  const disabled = ranked?.value === true;
  const state = {
    managedDisable: disabled && ranked.scope === 'managed',
    otherDisable: parentLock || (disabled && ranked.scope !== 'managed'),
    managedOnly: parentLock || view.get('allowManagedHooksOnly') === true,
    forceEnabled: (id: string): boolean => forceEnabledByManaged(view, id),
  };
  const commands = createCommandSourcePolicy(view).disabled;
  return {
    ...state,
    runs: (origin) => {
      const stops = stopsOf(origin, state.forceEnabled);
      const reason = HOOK_BLOCK_REASONS.find((each) =>
        APPLIES[each](stops, state, locks, commands),
      );
      return reason === undefined ? { run: true } : { run: false, reason };
    },
  };
}
