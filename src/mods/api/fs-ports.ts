/** The file-system port of the mods API (`$.fs`) and what it answers; see `ports.ts`. */

/**
 * One entry of `$.fs.list`: `{ name, kind, size, mtimeMs, isLink }` (claude-code/index.d.ts:5227);
 * `mtimeMs` a regular file's own, 0 for any other kind and when the host gives none.
 */
export interface FsEntry {
  readonly name: string;
  readonly kind: string;
  readonly size: number;
  readonly isLink: boolean;
  readonly mtimeMs?: number;
}

/**
 * What `$.fs.stat` resolves to (:5299): `{ kind, size, mtimeMs, isLink }`, and `realPath` when it was
 * asked with `{ resolve: true }` and the path leads somewhere.
 */
export interface FsStat {
  readonly kind: string;
  readonly size: number;
  readonly isLink: boolean;
  readonly mtimeMs?: number;
  readonly realPath?: string;
}

/** One instruction file `$.fs.ancestors` found (:5145): its directory, the name asked for, its text and its parts. */
export interface FsAncestor {
  readonly dir: string;
  readonly name: string;
  readonly content: string;
  readonly parts: readonly { readonly path: string; readonly content: string }[];
}

/** What `$.fs.ancestors` asks for (:5187), its paths absolute. */
export interface FsAncestorsRequest {
  readonly names: readonly string[];
  readonly of?: string;
  readonly below?: string;
}

/** The host's file system, with the same permissions as the user running Claude Code. Paths are absolute. */
export interface ModFs {
  /**
   * The file's text and its size in bytes, or `undefined` when there is no such file; asked `as:
   * 'bytes'`, also its bytes as standard padded `base64` (claude-code/index.d.ts:5216).
   */
  read(
    path: string,
    signal: AbortSignal,
    as?: 'text' | 'bytes',
  ): Promise<{ text: string; bytes: number; base64?: string } | undefined>;
  write(path: string, text: string, signal: AbortSignal): Promise<void>;
  list(path: string, signal: AbortSignal): Promise<readonly FsEntry[] | undefined>;
  /** The stat, `realPath` with it when `options.resolve` asks and the path leads somewhere. */
  stat(
    path: string,
    signal: AbortSignal,
    options?: { readonly resolve: boolean },
  ): Promise<FsStat | undefined>;
  exists(path: string, signal: AbortSignal): Promise<boolean>;
  /** The directories above `path`, nearest first. */
  ancestors(path: string, signal: AbortSignal): Promise<readonly string[]>;
  /**
   * The engine's own walk for instruction files (:3530), root first, each with its `@include`s:
   * optional; without it the kit reads each named file in the directories `ancestors` gives, with
   * no import followed (judgment, D8).
   */
  instructions?(request: FsAncestorsRequest, signal: AbortSignal): Promise<readonly FsAncestor[]>;
}
