import { warning, type PluginIssue } from '../format/issues.ts';
import type { ScanFolder } from '../ports/folder-scan.ts';
import { listSorted } from '../format/listing.ts';

/**
 * The walk of a scope folder, shared by the skills and the agents scans: the entries of a directory
 * with symbolic links followed, and the files of a tree. A link to a directory elsewhere on disk is
 * followed (skills.md, "Choose where skills load", "Symlinked folders"); one that dangles is skipped
 * with a warning, and a tree is walked at most `MAX_DEPTH` levels deep and each real directory once,
 * so a link loop ends (judgment, spec/judgments.md).
 */

export const MAX_DEPTH = 16;

export interface Child {
  readonly name: string;
  /** Relative to the folder opened. */
  readonly path: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  /** Where the entry really is; absent only when the host could not say. */
  readonly canonical?: string;
}

export interface Walked<T> {
  readonly found: readonly T[];
  readonly issues: readonly PluginIssue[];
}

const join = (directory: string, name: string): string =>
  directory === '.' ? name : `${directory}/${name}`;

/** The entries of `directory`, sorted by name, each classified through its link. */
export async function listChildren(
  folder: ScanFolder,
  directory: string,
  signal?: AbortSignal,
): Promise<Walked<Child>> {
  const entries = await listSorted(folder.files, directory, signal);
  if (entries === undefined) return { found: [], issues: [] };
  const checked = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      const stat = await folder.files.stat(path, signal);
      if (stat === undefined || (!stat.isFile && !stat.isDirectory)) {
        return {
          issue: warning(
            folder.hostPath(path),
            'a symbolic link that does not lead to a file or folder; skipped',
          ),
        };
      }
      const canonical = await folder.canonicalPath(path, signal);
      return {
        child: {
          name: entry.name,
          path,
          isFile: stat.isFile,
          isDirectory: stat.isDirectory,
          ...(canonical === undefined ? {} : { canonical }),
        } satisfies Child,
      };
    }),
  );
  return {
    found: checked.flatMap((each) => each.child ?? []),
    issues: checked.flatMap((each) => each.issue ?? []),
  };
}

export interface WalkedFile {
  /** Relative to the folder opened. */
  readonly path: string;
  /** The names below the walked directory: `frontend`, `component.md`. */
  readonly segments: readonly string[];
  readonly canonical?: string;
}

interface Walk {
  readonly folder: ScanFolder;
  readonly extension: string;
  readonly signal?: AbortSignal;
  readonly seen: Set<string>;
}

async function visit(
  walk: Walk,
  directory: string,
  prefix: readonly string[],
  depth: number,
): Promise<Walked<WalkedFile>> {
  const listed = await listChildren(walk.folder, directory, walk.signal);
  const parts = await Promise.all(
    listed.found.map(async (child): Promise<Walked<WalkedFile>> => {
      const segments = [...prefix, child.name];
      if (child.isFile) {
        const matches = child.name.toLowerCase().endsWith(walk.extension);
        return {
          found: matches ? [{ path: child.path, segments, ...canonicalOf(child) }] : [],
          issues: [],
        };
      }
      const key = child.canonical ?? child.path;
      if (depth >= MAX_DEPTH || walk.seen.has(key)) return { found: [], issues: [] };
      walk.seen.add(key);
      return visit(walk, child.path, segments, depth + 1);
    }),
  );
  return {
    found: parts.flatMap((part) => part.found),
    issues: [...listed.issues, ...parts.flatMap((part) => part.issues)],
  };
}

const canonicalOf = (child: Child): { readonly canonical?: string } =>
  child.canonical === undefined ? {} : { canonical: child.canonical };

/** The files below `root` with the extension (`.md`, case ignored), at any depth, sorted by path. */
export async function walkFiles(
  folder: ScanFolder,
  root: string,
  options: { readonly extension: string; readonly signal?: AbortSignal },
): Promise<Walked<WalkedFile>> {
  const walk: Walk = {
    folder,
    extension: options.extension.toLowerCase(),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    seen: new Set(),
  };
  const start = await folder.canonicalPath(root, options.signal);
  if (start !== undefined) walk.seen.add(start);
  return visit(walk, root, [], 0);
}
