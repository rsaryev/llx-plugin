/**
 * The port of `CLAUDE_ENV_FILE` (hooks.md, "Persist environment variables"): the host owns the files,
 * the kit decides which one an event's hooks write and when one is cleared. Two files, because their
 * lifetimes differ: what `SessionStart` and `Setup` hooks write lives the session, and what
 * `CwdChanged` and `FileChanged` hooks write lives "until the next CwdChanged event, when Claude Code
 * clears them".
 */
export const ENV_FILE_KINDS = ['session', 'cwd'] as const;
export type EnvFileKind = (typeof ENV_FILE_KINDS)[number];

export interface EnvFileStore {
  /**
   * The path of this session's file of one kind: a path a hook's `>> "$CLAUDE_ENV_FILE"` can append
   * to, its folder made. The same path every call for the session.
   */
  path(kind: EnvFileKind, signal: AbortSignal): Promise<string>;
  /** The text of a file (one of `path`'s, or the script `CLAUDE_ENV_FILE` named at launch); absent when there is none. */
  read(path: string, signal: AbortSignal): Promise<string | undefined>;
  /** Empties the file of one kind, as a `CwdChanged` event does. */
  clear(kind: EnvFileKind, signal: AbortSignal): Promise<void>;
}
