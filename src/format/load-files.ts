import type { FileStat, PluginFiles } from '../ports/files.ts';

/**
 * The port as one load reads it (judgment):
 * - once `signal` aborts, every next call rejects with its reason before reaching the host, so the
 *   parallel branches of a load stop at their next read instead of reading the rest of the plugin;
 * - `stat` and `exists` of a path are asked of the host once per load: discovery, containment and
 *   link checks ask about the same folders, and a remote port pays a round trip for each. Contents
 *   (`readText`, `readBytes`, `list`) are always read from the host.
 */
export function loadFiles(files: PluginFiles, signal: AbortSignal | undefined): PluginFiles {
  const checked =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      signal?.throwIfAborted();
      return call(...args);
    };
  const once = <R>(read: (path: string, inner?: AbortSignal) => Promise<R>) => {
    const known = new Map<string, Promise<R>>();
    return checked((path: string, inner?: AbortSignal) => {
      const asked = known.get(path) ?? read(path, inner);
      known.set(path, asked);
      return asked;
    });
  };
  return {
    readText: checked((path, inner) => files.readText(path, inner)),
    readBytes: checked((path, inner) => files.readBytes(path, inner)),
    list: checked((path, inner) => files.list(path, inner)),
    stat: once<FileStat | undefined>((path, inner) => files.stat(path, inner)),
    exists: once<boolean>((path, inner) => files.exists(path, inner)),
  };
}
