/**
 * `disableCommandPluginSources`: whether Claude Code may run a command a marketplace declares
 * (settings-reference.md, `disableCommandPluginSources` and "What runs under `allowManagedHooksOnly`";
 * plugins/host-marketplace.md, "When Claude Code skips a headersHelper command"). The kit returns the
 * decision; running, installing or loading a command-sourced plugin stays the host's.
 */
import type { PolicyKey } from '../../protocol/settings-keys.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';

/** The key that blocks a command: the explicit one, or the one that decides while it is unset. */
export type CommandBlocker = 'disableCommandPluginSources' | 'allowManagedHooksOnly';

export type CommandVerdict =
  | { readonly run: true }
  | { readonly run: false; readonly reason: CommandBlocker };

export interface CommandSourcePolicy {
  /** Command sources are blocked, by either key. */
  readonly disabled: boolean;
  /**
   * A plugin with a `command` source: its command never runs, it is not installed or updated, and one
   * already installed stops loading, a plugin force-enabled in managed `enabledPlugins` included.
   */
  readonly pluginSource: CommandVerdict;
  /**
   * A marketplace's or an inline plugin entry's `headersHelper`, given the scope of the file that
   * declares the marketplace. Blocked with the command sources, "except for a marketplace that managed
   * settings themselves declare".
   */
  headersHelper(declaredIn: PolicyScope): CommandVerdict;
}

const EXPLICIT = 'disableCommandPluginSources' satisfies PolicyKey;
const FOLLOWED = 'allowManagedHooksOnly' satisfies PolicyKey;

/**
 * Which key blocks, if any. The explicit value decides when set, `false` included; unset, the
 * organization's hook restriction decides ("Default: unset, so Claude Code follows
 * `allowManagedHooksOnly`"). `disableAllHooks` is not consulted, not even from the SDK's
 * `managedSettings`: it "doesn't by itself disable command sources".
 */
function blocker(view: PolicyView): CommandBlocker | undefined {
  const explicit = view.get(EXPLICIT);
  if (explicit !== undefined) return explicit ? EXPLICIT : undefined;
  return view.get(FOLLOWED) === true ? FOLLOWED : undefined;
}

const allowed: CommandVerdict = { run: true };

export function createCommandSourcePolicy(view: PolicyView): CommandSourcePolicy {
  const reason = blocker(view);
  const blockedVerdict: CommandVerdict = reason === undefined ? allowed : { run: false, reason };
  return {
    disabled: reason !== undefined,
    pluginSource: blockedVerdict,
    headersHelper: (declaredIn) => (declaredIn === 'managed' ? allowed : blockedVerdict),
  };
}
