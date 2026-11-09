import type { DirectoryEntry, PluginFiles } from '../../ports/index.ts';
import { listSorted } from '../../format/listing.ts';

/** A manifest path (`./skills/a`, `./`) as a `PluginFiles` path: no `./`, no trailing slash, `.` for the root. */
export function pluginPath(path: string): string {
  const trimmed = path.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '.' : trimmed;
}

/** `name` below `dir`; a name that is `.` is `dir` itself. */
export const childOf = (dir: string, name: string): string => {
  if (name === '.') return dir;
  return dir === '.' ? name : `${dir}/${name}`;
};

/** A folder's entries, or none when it does not exist. */
export async function entriesOf(
  files: PluginFiles,
  dir: string,
  signal?: AbortSignal,
): Promise<readonly DirectoryEntry[]> {
  return (await listSorted(files, dir, signal)) ?? [];
}
