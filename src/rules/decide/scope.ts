import type { PathContext, ToolCall } from '../types.ts';
import { absolutePath, normalizeAbsolute, relativeWithin, toPosixPath } from '../path/posix.ts';
import { pathText } from '../path/tools.ts';

/** `~` and `~/x` as the home directory spells them; other text is as written. */
export function expandHome(text: string, paths: PathContext): string {
  if (text === '~') return paths.home;
  return text.startsWith('~/') ? `${paths.home}/${text.slice(2)}` : text;
}

/** A host path in the kit's one form: POSIX, absolute, folded. */
export const posixOf = (path: string, paths: PathContext): string =>
  normalizeAbsolute(toPosixPath(path, paths.platform));

/**
 * The absolute POSIX path a path tool acts on: `~` expanded and a relative path read against the
 * current directory (a search with no path acts on the current directory). `undefined` for a call
 * with no path field.
 */
export function toolPath(call: ToolCall, paths: PathContext): string | undefined {
  const text = pathText(call);
  if (text === undefined) return undefined;
  return text === '' ? posixOf(paths.cwd, paths) : absolutePath(expandHome(text, paths), paths);
}

/** The working directory and the additional directories, in the kit's path form. */
const workingDirectories = (paths: PathContext): readonly string[] =>
  [paths.primaryWorkingDirectory, ...paths.additionalDirectories].map((dir) => posixOf(dir, paths));

/** Whether `path` is the working directory or an additional directory, or below one. */
export const inScope = (path: string, paths: PathContext): boolean =>
  workingDirectories(paths).some((root) => relativeWithin(root, path) !== undefined);
