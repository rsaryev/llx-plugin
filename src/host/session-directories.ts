import type { SessionOptions } from './session-types.ts';

/**
 * The directories of a live session: the working directory and the directories added with
 * `/add-dir`. `SessionOptions` gives the first values; `/cd` (permissions.md, "Move the session to
 * another directory") and `/add-dir` change them while the session, its hooks and its `once` keys go
 * on. Every part of the session reads them through here, never from the options.
 */
export interface SessionDirectories {
  cwd(): string;
  /** The added directories, in the order they were added. */
  added(): readonly string[];
  /** `/add-dir`: `false` when the directory was already added or is the working directory. */
  add(path: string): boolean;
  /** `/cd`. */
  moveTo(cwd: string): void;
}

export function createSessionDirectories(options: SessionOptions): SessionDirectories {
  let cwd = options.cwd;
  let added: readonly string[] = options.addedDirectories ?? [];
  return {
    cwd: () => cwd,
    added: () => added,
    add(path) {
      if (path === cwd || added.includes(path)) return false;
      added = [...added, path];
      return true;
    },
    moveTo(next) {
      cwd = next;
    },
  };
}
