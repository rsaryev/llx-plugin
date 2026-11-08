/** tools-reference.md, "Glob tool behavior": "capped at 100 files". */
export const GLOB_RESULT_CAP = 100;

export interface GlobMatch {
  readonly path: string;
  /** Modification time, in milliseconds. */
  readonly mtimeMs: number;
}

export interface CappedGlob {
  readonly paths: readonly string[];
  /** "If the cap is hit, Claude sees a truncation flag in the result." */
  readonly truncated: boolean;
}

/**
 * A Glob result as Claude receives it: sorted by modification time and capped at 100 files, with a
 * truncation flag when files were left out (tools-reference.md, "Glob tool behavior"). The docs do
 * not say which end of the order survives the cap: the newest files do, and files of one time keep
 * their order of arrival (spec/judgments.md). Walking the disk and reading times are the host's.
 */
export function capGlobMatches(matches: readonly GlobMatch[]): CappedGlob {
  const sorted = matches.toSorted((left, right) => right.mtimeMs - left.mtimeMs);
  return {
    paths: sorted.slice(0, GLOB_RESULT_CAP).map((match) => match.path),
    truncated: sorted.length > GLOB_RESULT_CAP,
  };
}
