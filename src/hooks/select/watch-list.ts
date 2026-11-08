import type { RegisteredHandler } from '../contracts.ts';

/**
 * hooks.md, "FileChanged": the matcher "serves two roles". Its value builds the watch list: "split
 * on `|` and each segment is registered as a literal filename in the working directory", so
 * `".envrc|.env"` watches exactly those two files and a regular expression such as `^\.env` would
 * watch a file literally named that. An omitted matcher "adds nothing to the watch list", while
 * `"*"` is registered like any value, as a file named `*`.
 *
 * Judgment (spec/judgments.md): an empty segment (`".env|"`, or the empty string) names no file.
 */
export function fileChangedWatchList(entries: readonly RegisteredHandler[]): readonly string[] {
  const names = entries
    .filter((entry) => entry.event === 'FileChanged')
    .flatMap((entry) => (entry.matcher ?? '').split('|'))
    .filter((name) => name !== '');
  return [...new Set(names)];
}
