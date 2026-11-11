import { configFolderOf } from '../format/config-directory.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { FolderScan, ScanFolder } from '../ports/folder-scan.ts';
import { readTextOf } from './folder-read.ts';
import { listChildren, walkFiles } from './folder-walk.ts';
import { projectDirectories } from './project-directories.ts';

/**
 * The scope folders of a session, shared by the skills, the agents and the saved-workflows scans:
 * where each scope's base directories are (the managed directory, the project and its parents, the
 * added directories, the home), and the files of one folder below a base, read through the host's
 * `FolderScan` port. Each scan keeps its own table of scopes and its own parser; this is what the
 * tables and the parsers stand on.
 */

/** What a scan of the scope folders is asked for. */
export interface ScopeRequest {
  readonly home: string;
  /** The working directory the session started in (or moved to with `/cd`). */
  readonly cwd: string;
  /** The directories passed with `--add-dir` or `/add-dir`, in the order they were added. */
  readonly addedDirectories?: readonly string[];
  /**
   * `CLAUDE_CONFIG_DIR` as the session's environment gives it; unset or empty, `<home>/.claude`. The
   * user scope's documented folder is that directory (`format/config-directory`); the host's extra
   * scope folders of the user scope stay below `home`.
   */
  readonly configDir?: string | undefined;
}

export interface ScopeContext<R extends ScopeRequest = ScopeRequest> {
  readonly folders: FolderScan;
  readonly request: R;
  readonly signal?: AbortSignal;
  /**
   * Folders beside `.claude` that the host also reads skills, commands and agents from, below every
   * base of every scope that reads its `.claude` folder (`.agents`, `.localix`). See `scopeFoldersOf`.
   */
  readonly extraScopeFolders?: readonly string[];
}

/** The documented folder below every scope base. */
export const CLAUDE_FOLDER = '.claude';

/**
 * The folders read below each base of a scope, in precedence order: `.claude`, then the host's extra
 * folders as given, a repeat dropped. Judgment (spec/judgments.md): the docs name `.claude` only; an
 * extra folder of a scope ranks after the `.claude` folder of every base of that scope, so a documented
 * file never yields its name to one of an extra folder of its own scope, and the scopes keep their
 * documented order.
 */
export const scopeFoldersOf = (context: ScopeContext): readonly string[] => [
  ...new Set([CLAUDE_FOLDER, ...(context.extraScopeFolders ?? [])]),
];

/** Where the base directories of a scope are; the user scope's are `SCOPE_PLACES.user`. */
export type ScopeBase = 'managed' | 'project' | 'repository' | 'added';

const only = (dir: string | undefined): Promise<readonly string[]> =>
  Promise.resolve(dir === undefined ? [] : [dir]);

/** The base directories of each kind, in precedence order within it. */
export const SCOPE_BASES: {
  readonly [B in ScopeBase]: (context: ScopeContext) => Promise<readonly string[]>;
} = {
  managed: ({ folders }) => only(folders.managedDirectory()),
  /** The working directory up to the repository root, and a worktree's main checkout (`projectDirectories`). */
  project: ({ folders, request, signal }) => projectDirectories(folders, request.cwd, signal),
  /** The working directory up to the repository root, nearest first, without the main checkout. */
  repository: async ({ folders, request, signal }) =>
    (await folders.repository(request.cwd, signal)).directories,
  added: ({ request }) => Promise.resolve(request.addedDirectories ?? []),
};

/** One folder a scope reads its containers (`skills`, `agents`) below. */
export interface ScopePlace {
  /** The directory opened through the `FolderScan` port. */
  readonly base: string;
  /** The folder below the base: `.claude`, an extra scope folder, or `''` for the configuration directory itself. */
  readonly root: string;
  /** Its base's place among the bases of the scope, in precedence order. */
  readonly index: number;
  /** The documented folder (`.claude`, or the configuration directory), not one of the host's extra ones. */
  readonly documented: boolean;
}

/** The places of a scope for the scope folders asked (`scopeFoldersOf`), in precedence order. */
export type ScopePlaces<C extends ScopeContext = ScopeContext> = (
  context: C,
  roots: readonly string[],
) => Promise<readonly ScopePlace[]>;

/** Each root below each base: every base's `.claude` first, then each extra folder of every base. */
export const placesBelow =
  <C extends ScopeContext>(bases: (context: C) => Promise<readonly string[]>): ScopePlaces<C> =>
  async (context, roots) => {
    const found = await bases(context);
    return roots.flatMap((root) =>
      found.map((base, index) => ({ base, root, index, documented: root === CLAUDE_FOLDER })),
    );
  };

/** The user scope: `.claude` is the configuration directory; an extra folder stays below the home. */
const userPlaces: ScopePlaces = ({ request }, roots) => {
  const config = configFolderOf(request.home, request.configDir);
  return Promise.resolve(
    roots.map((root) =>
      root === CLAUDE_FOLDER
        ? { base: config.base, root: config.folder, index: 0, documented: true }
        : { base: request.home, root, index: 0, documented: false },
    ),
  );
};

/** The places of each kind of scope base, and of the user scope. */
export const SCOPE_PLACES: { readonly [B in ScopeBase | 'user']: ScopePlaces } = {
  managed: placesBelow(SCOPE_BASES.managed),
  project: placesBelow(SCOPE_BASES.project),
  repository: placesBelow(SCOPE_BASES.repository),
  added: placesBelow(SCOPE_BASES.added),
  user: userPlaces,
};

/** The path of a container below a place's root: `.claude/skills`, or `skills` in the configuration directory. */
export const placePath = (place: Pick<ScopePlace, 'root'>, container: string): string =>
  place.root === '' ? container : `${place.root}/${container}`;

/** One file of a scope folder, with its text. */
export interface ScopeFile {
  /** Relative to the base opened. */
  readonly path: string;
  /** The path as the host names it, for messages and records. */
  readonly hostPath: string;
  /** The names below the folder: `frontend`, `component.md`. */
  readonly segments: readonly string[];
  /** Where the file really lives, when the host could say. */
  readonly canonical?: string;
  readonly text: string;
}

export interface ScopeFiles {
  readonly files: readonly ScopeFile[];
  /** A link that leads nowhere, a file the port refused. */
  readonly issues: readonly PluginIssue[];
}

export interface ScopeFilesOptions {
  /** The file extension, case ignored: `.md`. */
  readonly extension: string;
  /** `tree`: every depth ("recursively, so you can organize definitions into subfolders"); `flat`: the folder alone. */
  readonly depth: 'tree' | 'flat';
  readonly signal?: AbortSignal | undefined;
}

type Listed = {
  readonly path: string;
  readonly segments: readonly string[];
  readonly canonical?: string;
};
type Lister = (
  base: ScanFolder,
  container: string,
  options: ScopeFilesOptions,
) => Promise<{ readonly found: readonly Listed[]; readonly issues: readonly PluginIssue[] }>;

/** The files below `container` each depth names, without their text. */
const LISTERS: { readonly [D in ScopeFilesOptions['depth']]: Lister } = {
  tree: (base, container, { extension, signal }) =>
    walkFiles(base, container, { extension, ...(signal === undefined ? {} : { signal }) }),
  flat: async (base, container, { extension, signal }) => {
    const children = await listChildren(base, container, signal);
    const wanted = extension.toLowerCase();
    const found = children.found
      .filter((child) => child.isFile && child.name.toLowerCase().endsWith(wanted))
      .map((child) => ({
        path: child.path,
        segments: [child.name],
        ...(child.canonical === undefined ? {} : { canonical: child.canonical }),
      }));
    return { found, issues: children.issues };
  },
};

/**
 * The files of one folder below an opened base, with their text. A file the port refuses is skipped
 * with a warning (`readTextOf`); an aborted signal still rejects.
 */
export async function readScopeFiles(
  base: ScanFolder,
  container: string,
  options: ScopeFilesOptions,
): Promise<ScopeFiles> {
  const walked = await LISTERS[options.depth](base, container, options);
  const reads = await Promise.all(
    walked.found.map(async (file) => ({
      file,
      read: await readTextOf(base, file.path, options.signal),
    })),
  );
  return {
    files: reads.flatMap(({ file, read }) =>
      read.text === undefined
        ? []
        : [{ ...file, hostPath: base.hostPath(file.path), text: read.text }],
    ),
    issues: [...walked.issues, ...reads.flatMap(({ read }) => read.issue ?? [])],
  };
}

/** The folder to watch below an opened base: its host path when the scope watches it and it exists. */
export async function watchedFolder(
  base: ScanFolder,
  container: string,
  options: { readonly watched: boolean; readonly signal?: AbortSignal | undefined },
): Promise<readonly string[]> {
  if (!options.watched) return [];
  return (await base.files.exists(container, options.signal)) ? [base.hostPath(container)] : [];
}
