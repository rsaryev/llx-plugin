import type { PluginFiles } from './files.ts';

/**
 * Where the kit reads the folders a person or an organization keeps skills, commands and agents in
 * (skills.md, "Choose where skills load"; sub-agents.md, "Choose the subagent scope"): not a plugin's
 * folder but a scope root, `~`, the project, the managed settings directory, a directory added with
 * `--add-dir`. The kit asks for one folder at a time and reads it through `PluginFiles`; where the
 * folders are, whether a path is below a repository and what a symbolic link leads to are the
 * host's answers. A folder or path that does not exist is `undefined` or an empty list, never an error.
 */

/** One folder opened for reading: its files, and how this host writes the paths of what is below it. */
export interface ScanFolder {
  /** The host path of the folder, as it was asked for. */
  readonly dir: string;
  /** Read access: paths are relative to `dir`, `/`-separated; `.` is `dir` itself. */
  readonly files: PluginFiles;
  /** The path of an entry below the folder written the way this host writes paths (`/` or `\`). */
  hostPath(relativePath: string): string;
  /**
   * Where an entry really lives: the absolute host path once every symbolic link is followed, so two
   * names for one target compare equal. `undefined` when the entry does not exist, a link dangles or
   * links loop.
   */
  canonicalPath(relativePath: string, signal?: AbortSignal): Promise<string | undefined>;
}

/** The folders a project's own skills and commands are read from. */
export interface RepositoryChain {
  /**
   * The working directory, then each parent up to the top of the repository (up to the worktree's top
   * in a linked git worktree), nearest first. A working directory outside a repository is alone.
   */
  readonly directories: readonly string[];
  /** The main checkout's top folder, when the working directory is in a linked git worktree. */
  readonly mainCheckout?: string;
}

export interface FolderScan {
  /** The managed settings directory (`/etc/claude-code` on Linux), or `undefined` where the host has none. */
  managedDirectory(): string | undefined;
  open(dir: string, signal?: AbortSignal): Promise<ScanFolder | undefined>;
  repository(cwd: string, signal?: AbortSignal): Promise<RepositoryChain>;
  /**
   * The directories strictly below `start` down to the one that holds `touched`, outermost first;
   * none when `touched` is not below `start`. A file touched in `apps/web/src` below `/repo` gives
   * `/repo/apps`, `/repo/apps/web`, `/repo/apps/web/src`.
   */
  directoriesBelow(
    start: string,
    touched: string,
    signal?: AbortSignal,
  ): Promise<readonly string[]>;
}
