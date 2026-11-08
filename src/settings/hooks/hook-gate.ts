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
  /** `disableAllHooks` is `true` after precedence, in any other file or in the SDK's `managedSettings`. */
  readonly otherDisable: boolean;
  /** `allowManagedHooksOnly` is `true`. */
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

export function createHookGate(view: PolicyView, locks: HookLocks): HookGate {
  const disable = view.winner('disableAllHooks');
  const disabled = disable?.value === true;
  const state = {
    managedDisable: disabled && disable.scope === 'managed',
    otherDisable: disabled && disable.scope !== 'managed',
    managedOnly: view.get('allowManagedHooksOnly') === true,
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
