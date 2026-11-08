import type { InvocableFrontmatter } from '../format/skill-types.ts';
import { compileGlobs, globMatches, isUsablePattern } from '../rules/path/glob.ts';
import {
  normalizeAbsolute,
  relativeWithin,
  resolvePath,
  toPosixPath,
  type Platform,
} from '../rules/path/posix.ts';

/**
 * Whether a skill's `paths` activate it for a file (skills.md, frontmatter reference, `paths`):
 * "Patterns are relative to Claude's current working directory, and files outside that directory
 * don't match. Uses the same glob format as path-specific rules" (memory.md, "Path-specific
 * rules"): the gitignore syntax of the path rules, plus brace expansion.
 */

export interface PathGateOptions {
  /** The host's path flavour; Windows paths are matched in POSIX form (default `posix`). */
  readonly platform?: Platform;
}

/** The index of the `}` closing the `{` at `open`, or -1 when it never closes. */
function closingBrace(pattern: string, open: number): number {
  let depth = 0;
  for (let at = open; at < pattern.length; at += 1) {
    if (pattern[at] === '{') depth += 1;
    if (pattern[at] === '}') depth -= 1;
    if (depth === 0) return at;
  }
  return -1;
}

/** The comma-separated alternatives of a brace body, splitting only at depth 0. */
function alternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < body.length; at += 1) {
    if (body[at] === '{') depth += 1;
    if (body[at] === '}') depth -= 1;
    if (body[at] === ',' && depth === 0) {
      parts.push(body.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

/**
 * `src/**\/*.{ts,tsx}` to `src/**\/*.ts` and `src/**\/*.tsx` ("use brace expansion to match multiple
 * extensions in one pattern", memory.md). Judgment (spec/judgments.md): a group with no comma, or one
 * that never closes, is literal text, as in a shell.
 */
function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf('{');
  if (open < 0) return [pattern];
  const close = closingBrace(pattern, open);
  if (close < 0) return [pattern];
  const options = alternatives(pattern.slice(open + 1, close));
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  if (options.length < 2) {
    return expandBraces(tail).map((rest) => `${head}{${options[0] ?? ''}}${rest}`);
  }
  return options.flatMap((option) => expandBraces(`${head}${option}${tail}`));
}

/**
 * Whether the skill is active for `filePath` when the session's directory is `cwd`. A skill with no
 * `paths` is always active; a file outside `cwd` (a sibling worktree, a parent) never matches.
 */
export function skillActivatesFor(
  skill: Pick<InvocableFrontmatter, 'paths'>,
  filePath: string,
  cwd: string,
  options: PathGateOptions = {},
): boolean {
  if (skill.paths.length === 0) return true;
  const { platform = 'posix' } = options;
  const base = normalizeAbsolute(toPosixPath(cwd, platform));
  const file = resolvePath(base, toPosixPath(filePath, platform));
  const relative = relativeWithin(base, file);
  if (relative === undefined || relative === '') return false;
  const entries = skill.paths
    .flatMap(expandBraces)
    .filter(isUsablePattern)
    .map((pattern) => ({ pattern, negated: false }));
  return globMatches(compileGlobs(entries, platform), relative, false);
}
