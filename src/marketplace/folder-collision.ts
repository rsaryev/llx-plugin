import type { InstallSurface } from './install-errors.ts';

/**
 * Two plugin ids that share one folder (plugins/troubleshooting.md, "`\"<plugin>\" was not installed:
 * it would share its folder with \"<other>\"`"): "the same once `.` and `@` are written as `-`. On
 * macOS and Windows, ids that differ only in capitals map to the same folder too. Installing both
 * would put one plugin's files in the other's folder, so Claude Code refuses and the installed
 * plugin keeps its files." Pure over ids; the host reads the installed ones and refuses the install.
 */

export type FolderPlatform = 'macos' | 'windows' | 'linux';

/** Which platforms fold capitals when they name a folder. */
const FOLDS_CASE: { readonly [P in FolderPlatform]: boolean } = {
  macos: true,
  windows: true,
  linux: false,
};

/** The folder name an id maps to: `.` and `@` written as `-`, capitals folded where the platform does. */
export function folderOf(id: string, platform: FolderPlatform): string {
  const written = id.replaceAll(/[.@]/gu, '-');
  return FOLDS_CASE[platform] ? written.toLowerCase() : written;
}

/** What the two plugins would share: the section quotes both `its folder` and `its saved data`. */
export type SharedThing = 'folder' | 'saved data';

export interface FolderCollision {
  /** The id that is refused. */
  readonly plugin: string;
  /** The id it would share a folder with. */
  readonly other: string;
  /** The other plugin is installed, so uninstalling it is a way out; false when both arrive in one install. */
  readonly otherInstalled: boolean;
  readonly message: string;
}

/** The way out when the other plugin is installed, in the words of the surface the install was typed on. */
const WAY_OUT: { readonly [S in InstallSurface]: (other: string) => string } = {
  shell: (other) =>
    `Only one of the two can be installed. Run claude plugin uninstall ${other}, then install again.`,
  session: (other) =>
    `Only one of the two can be installed. Use the uninstall step in /plugin to remove "${other}", then install again.`,
};

function collision(
  plugin: string,
  other: string,
  otherInstalled: boolean,
  how: { readonly surface: InstallSurface; readonly shares: SharedThing },
): FolderCollision {
  const refused = `"${plugin}" was not installed: it would share its ${how.shares} with "${other}"`;
  return {
    plugin,
    other,
    otherInstalled,
    message: otherInstalled ? `${refused}. ${WAY_OUT[how.surface](other)}` : refused,
  };
}

/**
 * The incoming ids that cannot be installed: those that map to the folder of an installed id, and
 * those that map to the folder of an id that arrived earlier in the same install (judgment: the
 * later one is refused). An id that is already installed is not a collision with itself.
 */
export function folderCollisions(input: {
  readonly incoming: readonly string[];
  readonly installed: readonly string[];
  readonly platform: FolderPlatform;
  readonly surface: InstallSurface;
  /** Judgment: the docs print `folder` or `saved data` without saying when; the caller names the one it checked. */
  readonly shares?: SharedThing;
}): readonly FolderCollision[] {
  const how = { surface: input.surface, shares: input.shares ?? 'folder' };
  const folders = new Map<string, { id: string; installed: boolean }>();
  for (const id of input.installed) {
    folders.set(folderOf(id, input.platform), { id, installed: true });
  }
  const refused: FolderCollision[] = [];
  for (const id of input.incoming) {
    const key = folderOf(id, input.platform);
    const holder = folders.get(key);
    if (holder === undefined) folders.set(key, { id, installed: false });
    else if (holder.id !== id) refused.push(collision(id, holder.id, holder.installed, how));
  }
  return refused;
}
