import { GUARD_CONFIG_ID, GUARD_ID } from '../../protocol/mods-settings.ts';
import type { RegisterTier } from '../types.ts';
import {
  flagSetting,
  isManagedContext,
  listSetting,
  type ModsPolicyInput,
} from './policy-input.ts';

/**
 * Whether a hooks module may load, and in which tier (plugins/mods/admin.md, "Choose how much to
 * allow"; plugins/mods/troubleshoot.md, "Refusal messages"). A plugin that is not loaded keeps
 * the rest of itself: this decides the hooks module only.
 */

/** What the host knows about a plugin that has a hooks module. */
export interface ModCandidate {
  /** `name@marketplace`, `name@inline` for `--plugin-dir`, or `sec-default@builtin`. */
  readonly id: string;
  /** The manifest name, which names the mod in the chain. */
  readonly name: string;
  /** Built into Claude Code, not installed. */
  readonly isBuiltin: boolean;
  /** What managed settings and the marketplace say about an installed plugin. */
  readonly managed?: {
    /** Managed `enabledPlugins` sets the plugin to `true`. */
    readonly isEnabled: boolean;
    /** The absolute directory of the marketplace, when managed settings name it as a directory. */
    readonly marketplaceDirectory?: string;
    /** The marketplace lists the plugin by a relative path, so Claude Code loads it in place. */
    readonly isLoadedInPlace: boolean;
  };
  /** Names of the plugins this one lists under `dependencies`: it runs before them. */
  readonly dependencies: readonly string[];
}

export interface ModLoadDecision {
  readonly load: boolean;
  readonly tier: RegisterTier;
  /** Why the module is not loaded, as the debug log gives it after `hooks module <id> not loaded:`. */
  readonly reason?: string;
}

const isAbsolute = (path: string, platform: 'posix' | 'windows'): boolean =>
  platform === 'windows' ? /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path) : path.startsWith('/');

/**
 * A mod "counts as your organization's" only when managed `enabledPlugins` enables it, managed
 * settings name its marketplace as a directory by absolute path, and the marketplace lists it by
 * a relative path, so it loads in place (admin.md, "Install your organization's mods and set the
 * order"). A plugin copied into Claude Code's cache counts as a user's.
 */
export function countsAsOrganizations(
  candidate: ModCandidate,
  platform: 'posix' | 'windows',
): boolean {
  const managed = candidate.managed;
  if (candidate.isBuiltin || managed === undefined) return false;
  const directory = managed.marketplaceDirectory;
  return (
    managed.isEnabled &&
    managed.isLoadedInPlace &&
    directory !== undefined &&
    isAbsolute(directory, platform)
  );
}

/** The guard's id in either form `prependPlugins` accepts. */
export const isGuardId = (id: string): boolean => id === GUARD_ID || id === GUARD_CONFIG_ID;

/**
 * Where the guard loads: on a machine with managed settings, or in a session whose credential is a
 * Team or Enterprise `/login`. If managed `prependPlugins` is set, the guard loads only when that
 * list names it.
 */
export function guardLoads(policy: ModsPolicyInput): boolean {
  if (!isManagedContext(policy)) return false;
  const list = policy.managed?.prependPlugins;
  return list === undefined || list.some(isGuardId);
}

/** The refusal text of an installed plugin's hooks module that policy keeps out, or `undefined`. */
function installedRefusal(policy: ModsPolicyInput, isOrganizations: boolean): string | undefined {
  if (policy.flags.safeMode === true) {
    return 'installed plugins load no hooks module in this mode (--safe-mode)';
  }
  // The key reaches every installed plugin, the organization's too, in managed settings.
  if (flagSetting(policy.managed, 'disableAllHooks')) return 'disableAllHooks in managed settings';
  if (isOrganizations) return undefined;
  const narrowed =
    flagSetting(policy.managed, 'allowManagedHooksOnly') ||
    flagSetting(policy.user, 'disableAllHooks');
  if (narrowed) return 'only managed plugins and built-in plugins run';
  if (policy.flags.bare === true) {
    return 'installed plugins that are not managed load no hooks module in this mode (--bare)';
  }
  return undefined;
}

/** Where an installed plugin's hooks module runs: the lists in settings, else the organization's before users'. */
function installedTier(policy: ModsPolicyInput, candidate: ModCandidate): RegisterTier {
  const isOrganizations = countsAsOrganizations(candidate, policy.platform);
  const append = listSetting(policy, 'appendPlugins');
  const prepend = listSetting(policy, 'prependPlugins');
  // A list in managed settings names organization mods only: "Claude Code skips an id whose plugin
  // doesn't meet the conditions"; a list in the user's settings orders the user's own mods.
  const names = (list: typeof prepend): boolean =>
    list !== undefined && list.isManaged === isOrganizations && list.ids.includes(candidate.id);
  if (names(append)) return 'append';
  if (isOrganizations) return 'prepend';
  return names(prepend) ? 'prepend' : 'user';
}

/** The tier a built-in mod runs in: the guard first among `prepend`, other built-in mods last. */
const builtinTier = (candidate: ModCandidate): RegisterTier =>
  isGuardId(candidate.id) ? 'prepend' : 'builtin';

/**
 * Whether `candidate`'s hooks module loads under `policy`, and in which tier. The refusals are the
 * documented lines; the guard's own refusal of a user's mod (`allowManagedModsOnly`) is not here: it
 * is the guard's answer to `plugin.register`, after the module loaded.
 */
export function decideModLoad(policy: ModsPolicyInput, candidate: ModCandidate): ModLoadDecision {
  if (candidate.isBuiltin) {
    const loads = !isGuardId(candidate.id) || guardLoads(policy);
    return {
      load: loads,
      tier: builtinTier(candidate),
      ...(loads
        ? {}
        : { reason: 'the built-in guard loads only where an organization manages Claude Code' }),
    };
  }
  const reason = installedRefusal(policy, countsAsOrganizations(candidate, policy.platform));
  const tier = installedTier(policy, candidate);
  return reason === undefined ? { load: true, tier } : { load: false, tier, reason };
}

/** What `claude plugin test` and the troubleshooting table call the reason mods are turned off in this process (troubleshoot.md, "Check whether mods can load"). */
const ROLLOUT_REASONS = {
  'served-off': 'hooks modules are turned off in this process: the rollout switch served off',
  'saved-off':
    'hooks modules are turned off in this process: the rollout switch was saved off by an earlier session',
} as const;

/**
 * Why a shell command that loads the tester's own mods cannot: `disableAllHooks` in the user's or
 * the organization's settings ("here"), or the rollout switch ("in this process"). `undefined` when
 * mods can load. `allowManagedModsOnly` is not reported ("which this command doesn't report").
 */
export function hooksModulesOff(policy: ModsPolicyInput): string | undefined {
  if (policy.rollout !== undefined) return ROLLOUT_REASONS[policy.rollout];
  // The docs name the two settings; the wording after the colon is ours (judgment).
  if (flagSetting(policy.managed, 'disableAllHooks')) {
    return 'hooks modules are turned off here: disableAllHooks in managed settings';
  }
  return flagSetting(policy.user, 'disableAllHooks')
    ? 'hooks modules are turned off here: disableAllHooks in your settings'
    : undefined;
}
