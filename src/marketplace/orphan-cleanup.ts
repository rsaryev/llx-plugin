import type { InstallRecord } from './installed-plugins.ts';
import { isWithin } from '../format/link-rule.ts';
import type { PathJoin, StoreLayout } from './store-layout.ts';

/**
 * Cleanup of previous versions (plugins/loading.md): "When you update or uninstall a plugin, Claude
 * Code writes an `.orphaned_at` marker into the previous version directory. It removes that
 * directory in a background cleanup 14 days later, so a session that already loaded the old version
 * keeps running. The sweep runs only while `installed_plugins.json` records at least one install."
 * Pure: which directories to mark and which to remove; the host writes the marker, reads its time
 * and deletes. Judgments (spec/judgments.md): a directory is swept at exactly 14 days; a directory
 * a remaining record points at is neither marked nor swept, since it is in use again; a directory
 * outside the plugin cache (a plugin loaded in place points at its own source directory) is neither
 * marked nor swept, since a sweep would delete the user's own files.
 */

export const ORPHANED_MARKER = '.orphaned_at';

/** 14 days. */
export const ORPHAN_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export const orphanMarkerPath = (versionDir: string, join: PathJoin): string =>
  join(versionDir, ORPHANED_MARKER);

const slash = (path: string): string => path.replaceAll('\\', '/');

/** Whether a directory is inside the plugin cache: only those are marked, and later swept, as orphans. */
const inCache = (layout: StoreLayout, dir: string): boolean =>
  isWithin(slash(layout.cache()), slash(dir));

/**
 * The version directories an update or uninstall leaves behind: those of `removed` inside the cache
 * that no `remaining` record uses.
 */
export function dirsToOrphan(
  removed: readonly InstallRecord[],
  remaining: readonly InstallRecord[],
  layout: StoreLayout,
): readonly string[] {
  const inUse = new Set(remaining.map((one) => one.installPath));
  return [...new Set(removed.map((one) => one.installPath))].filter(
    (dir) => !inUse.has(dir) && inCache(layout, dir),
  );
}

export interface Orphan {
  readonly dir: string;
  /** When the marker was written, in Unix milliseconds. */
  readonly orphanedAtMs: number;
}

/** The directories the background cleanup removes now. */
export function orphanSweep(input: {
  /** Every install `installed_plugins.json` still records. */
  readonly remaining: readonly InstallRecord[];
  readonly orphans: readonly Orphan[];
  readonly nowMs: number;
  readonly layout: StoreLayout;
}): readonly string[] {
  if (input.remaining.length === 0) return [];
  const inUse = new Set(input.remaining.map((one) => one.installPath));
  return input.orphans
    .filter(
      (one) =>
        input.nowMs - one.orphanedAtMs >= ORPHAN_GRACE_MS &&
        !inUse.has(one.dir) &&
        inCache(input.layout, one.dir),
    )
    .map((one) => one.dir);
}
