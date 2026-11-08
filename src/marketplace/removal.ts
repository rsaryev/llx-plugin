import type { Marketplace } from '../format/marketplace/types.ts';
import { isWritableScope, type InstallScope } from './install-scopes.ts';

/**
 * `forceRemoveDeletedPlugins` (plugins/host-marketplace.md, "Uninstall removed plugins from users'
 * machines"): at each session start Claude Code "compares what users installed from your
 * marketplace against the entries and the `renames` map, and treats any plugin that is neither
 * listed nor renamed as removed", uninstalls it from the user, project and local scopes (what only
 * managed settings installed stays in place) and lists it as `Removed from marketplace`. The kit
 * decides what is removed; the host does the uninstalling.
 */

/** A plugin the user has installed, and the scopes it is installed or enabled in. */
export interface InstalledPlugin {
  readonly name: string;
  readonly marketplace: string;
  readonly scopes: readonly InstallScope[];
}

/** The status `/plugin` shows under its **Flagged** heading. */
export const REMOVED_STATUS = 'Removed from marketplace';

export interface RemovedPlugin {
  /** `name@marketplace`. */
  readonly id: string;
  readonly status: typeof REMOVED_STATUS;
  /** The scopes to uninstall from: every scope it is in but `managed`, which the user cannot change. */
  readonly uninstallFrom: readonly InstallScope[];
}

/**
 * Judgments (spec/judgments.md): only plugins installed from `marketplace` are considered; "renamed"
 * means a key of `renames` with a name as its target, even when its chain does not resolve, so a
 * map the marketplace got wrong never uninstalls on doubt; a `null` entry is a removal (the docs'
 * "mark a plugin deprecated" is that entry plus the flag); a listed name is never removed; a plugin
 * installed only by managed settings is still reported (it is treated as removed and flagged) with
 * nothing to uninstall.
 */
export function removedPlugins(
  installed: readonly InstalledPlugin[],
  marketplace: Marketplace,
): readonly RemovedPlugin[] {
  if (!marketplace.forceRemoveDeletedPlugins) return [];
  const listed = new Set(marketplace.plugins.map((entry) => entry.name));
  const renamed = (name: string): boolean =>
    Object.hasOwn(marketplace.renames, name) && marketplace.renames[name] !== null;
  return installed
    .filter((one) => one.marketplace === marketplace.name)
    .filter((one) => !listed.has(one.name) && !renamed(one.name))
    .map((one) => ({
      id: `${one.name}@${one.marketplace}`,
      status: REMOVED_STATUS,
      uninstallFrom: one.scopes.filter(isWritableScope),
    }));
}
