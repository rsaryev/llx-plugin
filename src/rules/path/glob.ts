import ignore, { type Ignore } from 'ignore';
import type { Platform } from './posix.ts';

/**
 * The gitignore engine of the path rules: "Read and Edit rules both use gitignore pattern syntax"
 * (permissions.md, "How path patterns match"), here the `ignore` package, over a path relative to the
 * rule's anchor. Case: Windows paths are compared without it, POSIX paths with it (a judgment, the
 * docs are silent).
 */
const CASE_SENSITIVE: { readonly [P in Platform]: boolean } = { posix: true, windows: false };

/** A pattern, and whether it is a `!` negation of what came before. */
export interface GlobEntry {
  readonly pattern: string;
  readonly negated: boolean;
}

/**
 * Whether gitignore would keep the pattern as a rule at all: a blank line and a `#` comment are not
 * rules. "A deny or ask rule whose path isn't usable as a gitignore pattern still guards that exact
 * path. An allow rule with an unusable pattern doesn't approve anything." (permissions.md)
 */
export const isUsablePattern = (pattern: string): boolean => {
  const text = pattern.trim();
  return text !== '' && !text.startsWith('#') && text !== '/';
};

export function compileGlobs(entries: readonly GlobEntry[], platform: Platform): Ignore {
  const lines = entries.map(({ pattern, negated }) => (negated ? `!${pattern}` : pattern));
  return ignore({ ignorecase: !CASE_SENSITIVE[platform] }).add(lines);
}

/**
 * A name no pattern is written for: a search tool's `path` is a directory, which gitignore only
 * matches through the files below it (`docs/**` does not match `docs`), so a directory is also
 * tried as the parent of this name (a judgment, spec/judgments.md).
 */
const DIRECTORY_PROBE = '.claude-kit-directory-probe';

/**
 * Whether the compiled patterns select `relative`. `''` and a parent climb (`..`, `../x`) never reach
 * the engine, which throws on them; a name that merely starts with two dots (`..hidden`) is a file.
 */
export function globMatches(globs: Ignore, relative: string, directory: boolean): boolean {
  if (relative === '' || relative === '..' || relative.startsWith('../')) return false;
  return globs.ignores(relative) || (directory && globs.ignores(`${relative}/${DIRECTORY_PROBE}`));
}
