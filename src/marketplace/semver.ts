import { Range, intersects, maxSatisfying, parse, rcompare, satisfies, validRange } from 'semver';

/**
 * The range side of `semver` (node-semver; `format/versions.ts` orders releases with it), the range grammar plugins/dependencies.md names
 * for a dependency's `version` ("a semantic-version range such as `~2.1.0`, `^2.0`, `>=1.4`, or
 * `=2.1.0`", linking github.com/npm/node-semver#ranges). Every rule below is node-semver's own, with
 * its default options: a range never matches a pre-release version unless it opts in with a
 * pre-release suffix on a comparator ("`^2.0.0-0`").
 */

/** Whether `range` is a valid node-semver range. */
export const isValidRange = (range: string): boolean => validRange(range) !== null;

/** A strict version (`2.1.0`, `2.0.0-beta.1`), as a git tag carries it: no `v`, `=` or blanks. */
export const strictVersion = (text: string): string | undefined => {
  const parsed = parse(text);
  if (parsed === null || parsed.raw !== text || /^[=v]|\s/i.test(text)) return undefined;
  return parsed.version;
};

/** The version `text` names, spelled one way (`v2.1.100` is `2.1.100`), or `undefined` when it is no version. */
export const normalizedVersion = (text: string): string | undefined => parse(text)?.version;

/** Whether `version` satisfies `range`; a version that is not semver satisfies nothing. */
export const satisfiesRange = (version: string, range: string): boolean =>
  validRange(range) !== null && satisfies(version, range);

/** The highest of `versions` inside `range`, or `undefined`. */
export const highestSatisfying = (
  versions: readonly string[],
  range: string,
): string | undefined => {
  if (validRange(range) === null) return undefined;
  return maxSatisfying([...versions], range) ?? undefined;
};

/** The highest of `versions` by semver order, or `undefined` when there are none. */
export const highestVersion = (versions: readonly string[]): string | undefined =>
  versions.toSorted(rcompare)[0];

/** Beyond this many combinations a set of ranges is "too complex to intersect" (see `rangesOverlap`). */
const MAX_COMBINATIONS = 64;

/** The `||` alternatives of a range, each a conjunction of comparators (`>=2.0.0 <3.0.0-0`): an interval. */
const alternativesOf = (range: string): readonly string[] =>
  new Range(range).range.split('||').map((one) => one.trim());

/** One alternative from each list, in every combination. */
const combinations = (lists: readonly (readonly string[])[]): readonly (readonly string[])[] =>
  lists.reduce<readonly (readonly string[])[]>(
    (so, list) => so.flatMap((chosen) => list.map((one) => [...chosen, one])),
    [[]],
  );

/** Whether intervals meet in a common point: in one dimension that is every pair (and each alone) meeting. */
const meet = (intervals: readonly string[]): boolean =>
  intervals.every(
    (a, index) => intersects(a, a) && intervals.slice(index + 1).every((b) => intersects(a, b)),
  );

/**
 * Whether some version satisfies all of `ranges` (each valid), or `undefined` when there are too
 * many `||` alternatives to decide ("has version requirements too complex to intersect"). The
 * alternatives are distributed (`(a || b) && c` is `a && c || b && c`); the combination is empty
 * unless the chosen intervals meet pairwise, which for intervals means a common point (Helly).
 */
export const rangesOverlap = (ranges: readonly string[]): boolean | undefined => {
  const lists = ranges.map(alternativesOf);
  const count = lists.reduce((product, list) => product * list.length, 1);
  if (count > MAX_COMBINATIONS) return undefined;
  return combinations(lists).some(meet);
};
