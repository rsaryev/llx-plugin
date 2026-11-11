/**
 * Counting decorators over the ports: each call of a port method is one unit (`<port>.<method>`),
 * a file's bytes count as they are read, and a path read or listed again within one measurement is
 * counted once more (`files.reread`, `files.relist`). They wrap any implementation, a fake or a real
 * one, and change no answer; the CPU proxies are silent while the port answers.
 */
import type { FolderScan, HostPorts, PluginFiles, ScanFolder } from '../../../src/index.ts';
import type { Tally } from './tally.ts';

/** `target` with every method counted as `<port>.<name>`; `extra` sees each call's arguments and result. */
function counted<T extends object>(
  target: T,
  port: string,
  tally: Tally,
  extra: (name: string, args: readonly unknown[], result: unknown) => unknown = (_n, _a, r) => r,
): T {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(target)) {
    const value: unknown = Reflect.get(target, name);
    if (typeof value !== 'function') {
      out[name] = value;
      continue;
    }
    const method = value;
    out[name] = (...args: never[]): unknown => {
      tally.add(`${port}.${name}`);
      return extra(
        name,
        args,
        tally.inPort(() => Reflect.apply(method, target, args)),
      );
    };
  }
  // A copy of `target`'s own properties, each method wrapped: the same interface.
  return out as T;
}

const sizeOf = (value: unknown): number =>
  typeof value === 'string'
    ? new TextEncoder().encode(value).length
    : value instanceof Uint8Array
      ? value.length
      : 0;

const READS = new Set(['readText', 'readBytes']);

/** A `PluginFiles` that counts its calls and bytes; `scope` keeps two folders' paths apart. */
export function countedFiles(files: PluginFiles, tally: Tally, scope: string): PluginFiles {
  return counted(files, 'files', tally, (name, args, result) => {
    const path = `${scope}:${String(args[0])}`;
    if (READS.has(name)) tally.again('files.reread', path);
    if (name === 'list') tally.again('files.relist', path);
    if (!READS.has(name) || !(result instanceof Promise)) return result;
    return result.then((data: unknown) => {
      tally.add('files.bytes', sizeOf(data));
      return data;
    });
  });
}

/** A `FolderScan` whose folders' files are counted too, each under its own directory. */
function countedFolders(folders: FolderScan, tally: Tally): FolderScan {
  return counted(folders, 'folders', tally, (name, args, result) => {
    if (name !== 'open' || !(result instanceof Promise)) return result;
    return result.then((folder: ScanFolder | undefined) =>
      folder === undefined
        ? undefined
        : { ...folder, files: countedFiles(folder.files, tally, String(args[0])) },
    );
  });
}

/** The host's ports with every call counted: commands, locations, environment, http, models, folders. */
export function countedPorts(ports: HostPorts, tally: Tally): HostPorts {
  return {
    ...ports,
    commands: counted(ports.commands, 'commands', tally),
    locations: counted(ports.locations, 'locations', tally),
    environment: counted(ports.environment, 'environment', tally),
    ...(ports.http && { http: counted(ports.http, 'http', tally) }),
    ...(ports.models && { models: counted(ports.models, 'models', tally) }),
    ...(ports.folders && { folders: countedFolders(ports.folders, tally) }),
  };
}
