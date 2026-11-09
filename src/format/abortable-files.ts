import type { PluginFiles } from '../ports/files.ts';

/**
 * The port behind a check of `signal`: once it aborts, every next call rejects with its reason
 * before reaching the host, so the parallel branches of a load stop at their next read instead of
 * reading the rest of the plugin (judgment). Without a signal the port is returned as is.
 */
export function abortableFiles(files: PluginFiles, signal: AbortSignal | undefined): PluginFiles {
  if (signal === undefined) return files;
  const checked =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      signal.throwIfAborted();
      return call(...args);
    };
  return {
    readText: checked((path, inner) => files.readText(path, inner)),
    readBytes: checked((path, inner) => files.readBytes(path, inner)),
    list: checked((path, inner) => files.list(path, inner)),
    stat: checked((path, inner) => files.stat(path, inner)),
    exists: checked((path, inner) => files.exists(path, inner)),
  };
}
