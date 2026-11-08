import type { PortFailure } from './failure.ts';

/**
 * Where a path really points, once every symlink on the way is followed (permissions.md,
 * "Symlinks"). Needed only by the symlink rules: a host that cannot resolve paths simply passes none
 * and a call keeps the one path it asked for.
 *
 * Paths are the kit's own: absolute, `/`-separated, with `.` and `..` already folded away; a Windows
 * host maps its drives to `/c/...` the way the path rules do (permissions.md, "Where a pattern
 * anchors") and back. `undefined` means nothing exists at the path (a file about to be written is
 * ordinary); a `PortFailure` means the host could not tell where the path leads, such as symlinks that
 * form a loop (permissions.md, "Paths that can't be resolved or that change"), which the rules turn
 * into a refusal, never a guess.
 */
export interface PathResolver {
  realpath(path: string, signal?: AbortSignal): Promise<string | PortFailure | undefined>;
}
