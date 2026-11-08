/**
 * Pure helpers over command names and host paths, for `resolveFolderSkills`.
 */

/** The parts of a host path, whichever separator it uses. */
export const segmentsOf = (path: string): readonly string[] =>
  path.split(/[/\\]+/).filter((part) => part !== '' && part !== '.');

/**
 * How synced skills' names are compared (skills.md, "When a synced skill name matches another
 * command"): "Claude Code ignores case, spacing, and invisible characters, and treats compatibility
 * forms such as fullwidth letters and dash variants as their plain equivalents". A look-alike letter
 * from another alphabet stays different.
 */
export const foldName = (name: string): string =>
  name
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{Cc}]/gu, '')
    .replace(/\p{Pd}/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();

/**
 * The directory `base` as a path below `cwd` (`apps/web`), `/`-separated: how a nested skill's
 * qualified name starts (skills.md, "How a skill gets its command name": "Subdirectory path relative
 * to the working directory"). A base that is not below `cwd` is its folder's name (judgment).
 */
export function relativeBelow(cwd: string, base: string): string {
  const root = segmentsOf(cwd);
  const parts = segmentsOf(base);
  const inside = root.every((part, index) => parts[index] === part);
  const below = inside ? parts.slice(root.length) : parts.slice(-1);
  return below.join('/');
}
