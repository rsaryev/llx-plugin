import type { MemoryRule } from '../format/memory-rule.ts';
import type { InvocableFrontmatter } from '../format/skill-types.ts';
import { compileGlobs, gitignoreMatches, isUsablePattern } from '../rules/path/glob.ts';
import {
  normalizeAbsolute,
  relativeWithin,
  resolvePath,
  toPosixPath,
  type Platform,
} from '../rules/path/posix.ts';
import { utf8Length } from '../format/utf8.ts';

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
 * "A rule's whole `paths` list shares one budget of 1,000 expanded patterns and 4 MiB, and patterns
 * without braces don't count against it" (memory.md, "Path-specific rules").
 */
const MAX_EXPANDED_PATTERNS = 1000;
const MAX_EXPANDED_BYTES = 4 * 1024 * 1024;

/**
 * `src/**\/*.{ts,tsx}` to `src/**\/*.ts` and `src/**\/*.tsx` ("use brace expansion to match multiple
 * extensions in one pattern", memory.md), or `undefined` when it would give more than `limit`
 * patterns (it stops at the first one over, so the cost is bounded by the limit). Judgment
 * (spec/judgments.md): a group with no comma, or one that never closes, is literal text, as in a shell.
 */
function expandBraces(pattern: string, limit: number): string[] | undefined {
  const open = pattern.indexOf('{');
  const close = open < 0 ? -1 : closingBrace(pattern, open);
  if (close < 0) return limit >= 1 ? [pattern] : undefined;
  const options = alternatives(pattern.slice(open + 1, close));
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  if (options.length < 2) {
    const rest = expandBraces(tail, limit);
    return rest?.map((text) => `${head}{${options[0] ?? ''}}${text}`);
  }
  const expanded: string[] = [];
  for (const option of options) {
    const part = expandBraces(`${head}${option}${tail}`, limit - expanded.length);
    if (part === undefined) return undefined;
    expanded.push(...part);
  }
  return expanded;
}

const byteLength = (patterns: readonly string[]): number =>
  patterns.reduce((sum, pattern) => sum + utf8Length(pattern), 0);

/**
 * The patterns of a `paths` list with their braces expanded, within the list's shared budget. A
 * pattern that would go over it is kept as written, and its literal braces match no files.
 */
function expandPaths(patterns: readonly string[]): string[] {
  let patternsLeft = MAX_EXPANDED_PATTERNS;
  let bytesLeft = MAX_EXPANDED_BYTES;
  return patterns.flatMap((pattern) => {
    if (!pattern.includes('{')) return [pattern];
    const expanded = expandBraces(pattern, patternsLeft);
    if (expanded === undefined || byteLength(expanded) > bytesLeft) return [pattern];
    patternsLeft -= expanded.length;
    bytesLeft -= byteLength(expanded);
    return expanded;
  });
}

/**
 * Whether the glob engine can compile the pattern at all: a pattern too large for a regular expression
 * is invalid, which "matches nothing" while "the rule's other patterns keep working" (memory.md).
 */
function compiles(pattern: string, platform: Platform): boolean {
  try {
    gitignoreMatches(compileGlobs([{ pattern, negated: false }], platform), 'probe', false);
    return true;
  } catch {
    return false;
  }
}

type Matcher = ReturnType<typeof compileGlobs>;

/** A `paths` list compiled once per platform: a skill's list is the same array for its whole life. */
const COMPILED: { readonly [P in Platform]: WeakMap<readonly string[], Matcher> } = {
  posix: new WeakMap(),
  windows: new WeakMap(),
};

function matcherOf(paths: readonly string[], platform: Platform): Matcher {
  const cached = COMPILED[platform].get(paths);
  if (cached !== undefined) return cached;
  const entries = expandPaths(paths)
    .filter(isUsablePattern)
    .filter((pattern) => compiles(pattern, platform))
    .map((pattern) => ({ pattern, negated: false }));
  const matcher = compileGlobs(entries, platform);
  COMPILED[platform].set(paths, matcher);
  return matcher;
}

/**
 * Whether a `paths` list matches `filePath`, its patterns relative to `base`: an empty list matches
 * every file; a file outside `base` (a sibling worktree, a parent) never matches. The one matcher of
 * a skill's and a memory rule's `paths`.
 */
function pathsMatch(
  paths: readonly string[],
  filePath: string,
  base: string,
  platform: Platform,
): boolean {
  if (paths.length === 0) return true;
  const root = normalizeAbsolute(toPosixPath(base, platform));
  const file = resolvePath(root, toPosixPath(filePath, platform));
  const relative = relativeWithin(root, file);
  if (relative === undefined || relative === '') return false;
  return gitignoreMatches(matcherOf(paths, platform), relative, false);
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
  return pathsMatch(skill.paths, filePath, cwd, options.platform ?? 'posix');
}

const RULES_FOLDER = '/.claude/rules/';

/**
 * The folder a rule's patterns are relative to (memory.md, "Path-specific rules"): for a project
 * rule "the directory that contains the rule's `.claude` folder" (the last `.claude/rules/` in its
 * path, so a nested folder's rule is relative to its own subdirectory); for a user rule, and a
 * project rule whose path names no such folder, the session's primary working directory `cwd`.
 */
export function ruleBase(
  rule: Pick<MemoryRule, 'path' | 'scope'>,
  cwd: string,
  options: PathGateOptions = {},
): string {
  const path = toPosixPath(rule.path, options.platform ?? 'posix');
  const at = path.lastIndexOf(RULES_FOLDER);
  return rule.scope === 'project' && at >= 0 ? path.slice(0, at) || '/' : cwd;
}

/**
 * Whether a memory rule loads for `filePath`, which Claude read, wrote or edited: "A path-scoped
 * rule loads when Claude uses the Read, Write, or Edit tool on a matching file". A rule with no
 * `paths` is "loaded at launch", so it matches every file.
 */
export function ruleActivatesFor(
  rule: Pick<MemoryRule, 'path' | 'scope' | 'paths'>,
  filePath: string,
  cwd: string,
  options: PathGateOptions = {},
): boolean {
  const platform = options.platform ?? 'posix';
  return pathsMatch(rule.paths, filePath, ruleBase(rule, cwd, options), platform);
}
