/**
 * Read access to one plugin folder (docs/API.md, "Ports"). Paths are relative to the folder, use
 * `/` and never leave it; `.` is the folder itself. A path that does not exist is `undefined`,
 * never an error: absence is an ordinary answer, a plugin is allowed to omit a file.
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

/** The narrowest read: a text file, wherever it lives (an agent memory folder, a plugin file). */
export interface TextFileReader {
  /** The file's text decoded as UTF-8, or `undefined` when there is no such file. */
  readText(path: string, signal?: AbortSignal): Promise<string | undefined>;
}

export interface PluginFiles extends TextFileReader {
  readBytes(path: string, signal?: AbortSignal): Promise<Uint8Array | undefined>;
  /** Entries of a directory sorted by name, or `undefined` when it does not exist. */
  list(path: string, signal?: AbortSignal): Promise<readonly DirectoryEntry[] | undefined>;
  stat(path: string, signal?: AbortSignal): Promise<FileStat | undefined>;
  exists(path: string, signal?: AbortSignal): Promise<boolean>;
}
