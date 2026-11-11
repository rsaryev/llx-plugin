import type { InstallRecord } from './installed-plugins.ts';
import type { PathJoin, StoreLayout } from './store-layout.ts';
import { withoutTrailingSlashes } from '../format/path-text.ts';

/**
 * Cleanup of previous versions (plugins/loading.md): "When you update or uninstall a plugin, Claude
 * Code writes an `.orphaned_at` marker into the previous version directory. It removes that
 * directory in a background cleanup 14 days later, so a session that already loaded the old version
 * keeps running. The sweep runs only while `installed_plugins.json` records at least one install."
 * Pure: which directories to mark and which to remove; the host writes the marker, reads its time
 * and deletes. Judgments (spec/judgments.md): a directory is swept at exactly 14 days; a directory
 * a remaining record points at is neither marked nor swept, since it is in use again; only a
 * version directory of the cache, exactly `cache/<marketplace>/<plugin>/<version>`, is marked or
 * swept: a plugin loaded in place points at its own source directory, and a sweep of it, of the
 * cache or of a marketplace folder would delete what is not an old version.
 */

export const ORPHANED_MARKER = '.orphaned_at';

/** 14 days. */
export const ORPHAN_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export const orphanMarkerPath = (versionDir: string, join: PathJoin): string =>
  join(versionDir, ORPHANED_MARKER);

const slash = (path: string): string => withoutTrailingSlashes(path.replaceAll('\\', '/'));

/** `<marketplace>/<plugin>/<version>`: three names, none empty, `.` or `..`. */
const VERSION_DIR_SEGMENTS = 3;
const isName = (segment: string): boolean => segment !== '' && segment !== '.' && segment !== '..';

/**
 * Whether a directory is a version directory of the plugin cache, `cache/<marketplace>/<plugin>/
 * <version>/`, written with no `.` or `..` segment: only those are marked, and later swept, as
 * orphans. The cache itself, a marketplace or plugin folder, a folder below a version and a path
 * that would need resolving are not (judgment, spec/judgments.md).
 */
const isCachedVersionDir = (layout: StoreLayout, dir: string): boolean => {
  const prefix = `${slash(layout.cache())}/`;
  const path = slash(dir);
  if (!path.startsWith(prefix)) return false;
  const segments = path.slice(prefix.length).split('/');
  return segments.length === VERSION_DIR_SEGMENTS && segments.every(isName);
};

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
    (dir) => !inUse.has(dir) && isCachedVersionDir(layout, dir),
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
        isCachedVersionDir(input.layout, one.dir),
    )
    .map((one) => one.dir);
}
