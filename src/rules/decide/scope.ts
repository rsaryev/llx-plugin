import type { PathContext } from '../types.ts';
import { normalizeAbsolute, relativeWithin, toPosixPath } from '../path/posix.ts';

/** A host path in the kit's one form: POSIX, absolute, `.` and `..` folded. */
export const posixOf = (path: string, paths: PathContext): string =>
  normalizeAbsolute(toPosixPath(path, paths.platform));

/**
 * The working directory and the additional directories, in the kit's path form, each with its real
 * location when it is reached through a link (`PathContext.realDirectories`): a file the symlink
 * check resolves below the real location sits in that working directory (permissions.md, "Writes
 * through a symlink"; a judgment, spec/judgments.md).
 */
const workingDirectories = (paths: PathContext): readonly string[] =>
  [paths.primaryWorkingDirectory, ...paths.additionalDirectories].flatMap((dir) => {
    const spelled = posixOf(dir, paths);
    const real = paths.realDirectories?.get(spelled);
    return real === undefined ? [spelled] : [spelled, real];
  });

/** Whether `path` is the working directory or an additional directory, or below one. */
export const inScope = (path: string, paths: PathContext): boolean =>
  workingDirectories(paths).some(
    (root) => relativeWithin(root, path, paths.platform) !== undefined,
  );
