import type { FolderScan, RepositoryChain, ScanFolder } from '../../ports/folder-scan.ts';
import type { DirectoryEntry, FileStat, PluginFiles } from '../../ports/index.ts';

const encoder = new TextEncoder();
const MAX_LINKS = 40;

/** A file's text, or a symbolic link to another absolute path of the disk. */
export type DiskEntry = string | { readonly symlink: string };

export interface DiskOptions {
  /** The managed settings directory. */
  readonly managed?: string | undefined;
  /** The top folder of each repository; a folder below one is inside it. */
  readonly repositories?: readonly string[];
  /** A linked worktree's top folder and the main checkout it belongs to. */
  readonly worktrees?: Readonly<Record<string, string>>;
}

const segmentsOf = (path: string): string[] =>
  path.split(/[/\\]+/).filter((part) => part !== '' && part !== '.');
const normal = (path: string): string => `/${segmentsOf(path).join('/')}`;
const parentOf = (path: string): string => normal(segmentsOf(path).slice(0, -1).join('/'));
const isBelow = (parent: string, path: string): boolean =>
  parent === '/' || path === parent || path.startsWith(`${parent}/`);

/** The tree behind `folderScan`: files, links and what a path leads to. Nothing is recorded. */
function disk(files: Readonly<Record<string, DiskEntry>>) {
  const data = new Map<string, string>();
  const links = new Map<string, string>();
  for (const [path, entry] of Object.entries(files)) {
    if (typeof entry === 'string') data.set(normal(path), entry);
    else links.set(normal(path), normal(entry.symlink));
  }
  /** The path with every link followed, or `undefined` when a link loops. */
  const resolve = (path: string): string | undefined => {
    let current = '';
    const pending = segmentsOf(path);
    let hops = 0;
    while (pending.length > 0) {
      current = `${current}/${pending.shift() ?? ''}`;
      let target = links.get(current);
      while (target !== undefined) {
        if (++hops > MAX_LINKS) return undefined;
        current = target;
        target = links.get(current);
      }
    }
    return current === '' ? '/' : current;
  };
  const keys = [...data.keys(), ...links.keys()];
  const isDirectory = (path: string): boolean =>
    path === '/' || keys.some((key) => key.startsWith(`${path}/`));
  const names = (directory: string): string[] => {
    const prefix = directory === '/' ? '/' : `${directory}/`;
    const found = keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length).split('/')[0] ?? '');
    return [...new Set(found)].toSorted((a, b) => a.localeCompare(b));
  };
  return { data, links, resolve, isDirectory, names };
}

type Disk = ReturnType<typeof disk>;

/** `PluginFiles` over the disk, rooted at `base`: links are followed wherever they lead. */
function filesAt(tree: Disk, base: string): PluginFiles {
  const absolute = (path: string): string => normal(`${base}/${path}`);
  const kind = (path: string) => {
    const real = tree.resolve(path);
    return {
      real,
      isFile: real !== undefined && tree.data.has(real),
      isDirectory: real !== undefined && tree.isDirectory(real),
    };
  };
  const stat = (path: string): FileStat | undefined => {
    const exact = absolute(path);
    const { real, isFile, isDirectory } = kind(exact);
    const isSymlink = tree.links.has(exact);
    if (!isSymlink && !isFile && !isDirectory) return undefined;
    const text = real === undefined ? undefined : tree.data.get(real);
    return {
      isFile,
      isDirectory,
      isSymlink,
      size: text === undefined ? 0 : encoder.encode(text).length,
      ...(isSymlink && real !== undefined ? { realPath: real } : {}),
    };
  };
  const text = (path: string): string | undefined => {
    const { real, isFile } = kind(absolute(path));
    return isFile && real !== undefined ? tree.data.get(real) : undefined;
  };
  return {
    readText: (path) => Promise.resolve(text(path)),
    readBytes: (path) => {
      const found = text(path);
      return Promise.resolve(found === undefined ? undefined : encoder.encode(found));
    },
    list: (path) => {
      const { real, isDirectory } = kind(absolute(path));
      if (!isDirectory || real === undefined) return Promise.resolve(undefined);
      const entries: DirectoryEntry[] = tree.names(real).map((name) => {
        const child = kind(`${real}/${name}`);
        return { name, isFile: child.isFile, isDirectory: child.isDirectory };
      });
      return Promise.resolve(entries);
    },
    stat: (path) => Promise.resolve(stat(path)),
    exists: (path) => Promise.resolve(stat(path) !== undefined),
  };
}

/** From `here` up to `top` (or the root), nearest first. */
function upTo(here: string, top: string | undefined): string[] {
  const directories: string[] = [];
  for (let at = here; ; at = parentOf(at)) {
    directories.push(at);
    if (at === top || at === '/') return directories;
  }
}

function repositoryOf(cwd: string, options: DiskOptions): RepositoryChain {
  const here = normal(cwd);
  const worktree = Object.keys(options.worktrees ?? {}).find((top) => isBelow(normal(top), here));
  const top =
    worktree === undefined
      ? options.repositories?.map(normal).find((root) => isBelow(root, here))
      : normal(worktree);
  const main = worktree === undefined ? undefined : options.worktrees?.[worktree];
  return {
    directories: top === undefined ? [here] : upTo(here, top),
    ...(main === undefined ? {} : { mainCheckout: normal(main) }),
  };
}

/**
 * An in-memory disk for the scope folders (docs/API.md, "Testing kit"): the record is read again at
 * each `open`, so a test that adds, edits or deletes a key sees it at the next reload. Keys are absolute
 * `/`-separated paths, values the file's text or `{ symlink: '<absolute target>' }`; directories
 * exist as the prefixes of the keys, and a link is followed wherever it points, inside the opened
 * folder or outside it. `opened` lists every folder the kit asked for, in order.
 */
export function folderScan(
  files: Readonly<Record<string, DiskEntry>>,
  options: DiskOptions = {},
): FolderScan & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    managedDirectory: () => options.managed,
    open: (dir) => {
      opened.push(dir);
      // Read the record at each call: a test edits it between reloads, as a person edits a folder.
      const tree = disk(files);
      const base = tree.resolve(dir);
      if (base === undefined || !tree.isDirectory(base)) return Promise.resolve(undefined);
      const folder: ScanFolder = {
        dir,
        files: filesAt(tree, dir),
        hostPath: (relative) => normal(`${dir}/${relative}`),
        canonicalPath: (relative) => {
          const real = tree.resolve(normal(`${dir}/${relative}`));
          const exists = real !== undefined && (tree.data.has(real) || tree.isDirectory(real));
          return Promise.resolve(exists ? real : undefined);
        },
      };
      return Promise.resolve(folder);
    },
    repository: (cwd) => Promise.resolve(repositoryOf(cwd, options)),
    directoriesBelow: (start, touched) => {
      const from = normal(start);
      const parts = segmentsOf(touched);
      const dirs = parts
        .slice(0, -1)
        .map((_part, index) => `/${parts.slice(0, index + 1).join('/')}`)
        .filter((dir) => dir !== from && isBelow(from, dir));
      return Promise.resolve(isBelow(from, normal(touched)) ? dirs : []);
    },
  };
}
