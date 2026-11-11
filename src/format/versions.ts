import { compare, parse } from 'semver';

/**
 * Host release numbers, as the docs' "since v2.1.N" rules name them: one comparison for every such
 * rule. A leading `v`, surrounding blanks and text after the number (`2.1.320 (Claude Code)`) are
 * tolerated; a pre-release (`2.1.310-beta.1`) sorts before its release, its dot-separated parts
 * compared numerically when both are numbers, as in semver. A text with no leading
 * `major.minor.patch` is no version (judgment, spec/judgments.md). The order is node-semver's
 * precedence; plugin version ranges are `marketplace/semver`'s.
 */

const RELEASE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;

/** The `major.minor.patch[-pre]` a text starts with, as node-semver reads it; none for a text with none. */
const releaseOf = (text: string): string | undefined => {
  const found = RELEASE.exec(text.trim())?.[1];
  return found === undefined ? undefined : (parse(found)?.version ?? undefined);
};

/** Negative, zero or positive as `a` is before, the same as or after `b`; `undefined` when either is no version. */
export function compareVersions(a: string, b: string): number | undefined {
  const [left, right] = [releaseOf(a), releaseOf(b)];
  return left === undefined || right === undefined ? undefined : compare(left, right);
}

/** Whether `version` is `minimum` or later; a text that is no version is never at least anything. */
export const versionAtLeast = (version: string, minimum: string): boolean =>
  (compareVersions(version, minimum) ?? -1) >= 0;
