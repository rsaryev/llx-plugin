/**
 * Read access to files (docs/API.md, "Ports"). `PluginFiles` reads one plugin folder: its paths are
 * relative to the folder, use `/` and never leave it; `.` is the folder itself. `TextFileReader`
 * reads wherever the host says: its paths are host paths (absolute, built from `Locations`, such
 * as `~/.claude/agent-memory/<agent>/`), and a `PluginFiles` satisfies it only with its own
 * relative paths. A path that does not exist is `undefined`, never an error: absence is an
 * ordinary answer, a plugin is allowed to omit a file.
 */

/** What a host knows about one entry; booleans, so no code compares a kind to a string. */
export interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  /** Where a symlink really points, relative to the folder; absent for a regular entry. */
  readonly realPath?: string;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
}

/**
 * The narrowest read: a text file. Which paths it takes depends on who holds it: root-relative
 * for a `PluginFiles`, host paths from `Locations` for a reader of an agent memory folder.
 */
export interface TextFileReader {
  /** The file's text decoded as UTF-8, or `undefined` when there is no such file. */
  readText(path: string, signal?: AbortSignal): Promise<string | undefined>;
}

export interface PluginFiles extends TextFileReader {
  readBytes(path: string, signal?: AbortSignal): Promise<Uint8Array | undefined>;
  /** Entries of a directory in any order (the kit sorts them), or `undefined` when it does not exist. */
  list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[] | undefined>;
  stat(path: string, signal?: AbortSignal): Promise<FileStat | undefined>;
  exists(path: string, signal?: AbortSignal): Promise<boolean>;
}
