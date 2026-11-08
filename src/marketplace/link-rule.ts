/**
 * Where a symbolic link leads, judged against the plugin and its marketplace (plugins/host-
 * marketplace.md, "Share files within a marketplace with symlinks"; plugins/loading.md, "Paths
 * that escape the plugin directory"). Pure over paths the host resolved (real paths, `/`-separated,
 * the same spelling for the roots and the target): the kit looks nothing up.
 */

/** What a link's resolved target is, relative to the plugin and, when it has one, its marketplace. */
export type LinkReach = 'within-plugin' | 'within-marketplace' | 'outside';

const trimmed = (path: string): string => path.replace(/\/+$/, '');

/** True when `path` is `root` or inside it, by whole path segments. */
export function isWithin(root: string, path: string): boolean {
  const base = trimmed(root);
  const candidate = trimmed(path);
  return candidate === base || candidate.startsWith(`${base}/`);
}

/**
 * Where a target resolves: "Within the plugin's own directory", "Elsewhere within the same
 * marketplace", or "Outside the marketplace". A plugin with no marketplace (a local path, a
 * `command` source in copy mode) has only its own directory to stay in.
 */
export function linkReach(input: {
  readonly target: string;
  readonly pluginRoot: string;
  readonly marketplaceRoot?: string;
}): LinkReach {
  if (isWithin(input.pluginRoot, input.target)) return 'within-plugin';
  const marketplace = input.marketplaceRoot;
  return marketplace !== undefined && isWithin(marketplace, input.target)
    ? 'within-marketplace'
    : 'outside';
}

/** `rel` (a path below the plugin root) as a path from the folder `fromDirectory` (also below it). */
export function relativeFrom(fromDirectory: string, rel: string): string {
  const down = fromDirectory === '' || fromDirectory === '.' ? [] : fromDirectory.split('/');
  const to = rel.split('/');
  let shared = 0;
  while (shared < down.length && shared < to.length && down[shared] === to[shared]) {
    shared += 1;
  }
  const up = down.slice(shared).map(() => '..');
  const path = [...up, ...to.slice(shared)].join('/');
  return path === '' ? '.' : path;
}
