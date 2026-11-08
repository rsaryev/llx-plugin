import { error, type PluginIssue } from '../../../format/issues.ts';
import type { Environment } from '../../../ports/environment.ts';
import { isRecord } from '../inputs/record.ts';

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

const NULL_BYTE = '\u0000';

/**
 * "A `pattern` or `path` value that contains a null byte returns an error asking Claude to remove
 * it" (tools-reference.md, "Glob tool behavior"): one issue at `tool_input.<field>` per field that
 * holds one. The wording is a judgment (spec/judgments.md); a value that is not a string is left to
 * `parseToolInput`.
 */
export function validateGlobInput(input: unknown): readonly PluginIssue[] {
  if (!isRecord(input)) return [];
  return (['pattern', 'path'] as const).flatMap((field) => {
    const value = input[field];
    return typeof value === 'string' && value.includes(NULL_BYTE)
      ? [error(`tool_input.${field}`, `${field} contains a null byte: remove it and search again`)]
      : [];
  });
}

/**
 * "Glob doesn't respect `.gitignore` by default ... To make Glob respect `.gitignore`, set
 * `CLAUDE_CODE_GLOB_NO_IGNORE=false`" (tools-reference.md; env-vars.md: "Set to `false`"). Only the
 * text `false` does; any other value, or none, leaves gitignored files in (spec/judgments.md).
 */
export function globRespectsIgnore(env: Pick<Environment, 'get'>): boolean {
  return env.get('CLAUDE_CODE_GLOB_NO_IGNORE')?.trim() === 'false';
}
