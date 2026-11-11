import { RESTRICTS } from '../restricts.ts';
import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import type { MatchContext, PathContext, PermissionRule, PreparedCall } from '../types.ts';
import { anchorPattern, readPathSpecifier, type PathSpecifier } from './anchor.ts';
import { DEPTH } from './depth.ts';
import { compileGlobs, gitignoreMatches, isUsablePattern, type GlobEntry } from './glob.ts';
import { absolutePath, relativeWithin, resolvePath } from './posix.ts';
import { COVERAGE, PATHLESS_CALLS, requestedPath, searchesDirectory } from './tools.ts';

/** The text pattern of a path rule, or `undefined` for a bare or parameter rule. */
export function pathSpecifierOf(rule: PermissionRule): PathSpecifier | undefined {
  const { specifier } = rule;
  return specifier?.form === 'text' ? readPathSpecifier(specifier.pattern) : undefined;
}

/**
 * Every path a call is checked at: the requested one and the files it resolves to (permissions.md,
 * "Symlinks"). A deny or ask rule also reaches a path given by the real location of a directory the
 * rule was written through (`/private/etc/hosts` for `Read(//etc/**)`).
 */
function spellings(path: string, paths: PathContext): string[] {
  const found: string[] = [];
  for (const [written, real] of paths.realDirectories ?? []) {
    const rest = relativeWithin(real, path, paths.platform);
    if (rest !== undefined) found.push(resolvePath(written, rest));
  }
  return found;
}

function callPaths(
  rule: PermissionRule,
  call: PreparedCall,
  paths: PathContext,
): string[] | undefined {
  const requested = requestedPath(call, paths);
  if (requested === undefined) return undefined;
  const resolved = (call.resolvedPaths ?? []).map((path) => absolutePath(path, paths));
  const forms = [requested, ...resolved];
  // A deny or ask rule also reaches the real location of a directory it was written through.
  if (!RESTRICTS[rule.behavior]) return forms;
  return [...forms, ...forms.flatMap((form) => spellings(form, paths))];
}

/** Allow rules need every path to match, deny and ask rules any one (permissions.md, "Symlinks"). */
const COMBINE: {
  readonly [B in PermissionBehavior]: (
    forms: readonly string[],
    test: (form: string) => boolean,
  ) => boolean;
} = {
  allow: (forms, test) => forms.every(test),
  deny: (forms, test) => forms.some(test),
  ask: (forms, test) => forms.some(test),
};

/** Everything one rule is matched with, besides the path. */
interface Scope {
  readonly rule: PermissionRule;
  readonly specifier: PathSpecifier;
  readonly paths: PathContext;
  /** `!` rules from the same source listed after the rule (`negation.ts`). */
  readonly carveOuts: readonly PathSpecifier[];
  readonly directory: boolean;
  /** Whose depth rule widens a single-directory pattern: the context's, else the rule's own. */
  readonly depthOf: PermissionBehavior;
}

function matchesPath(scope: Scope, path: string): boolean {
  const { rule, specifier, paths } = scope;
  const { root, pattern, underCwd } = anchorPattern(specifier, rule.source, paths);
  if (!isUsablePattern(pattern)) {
    // `/` alone is the anchor itself: the slash only anchors the text, it is not the filesystem root.
    // A deny or ask rule keeps its exact path; an allow rule approves nothing.
    return (
      RESTRICTS[rule.behavior] &&
      relativeWithin(resolvePath(root, pattern.replace(/^\//, '')), path, paths.platform) === ''
    );
  }
  const relative = relativeWithin(root, path, paths.platform);
  if (relative === undefined) return false;
  // A `../` pattern names two directories, so the one-directory depth rule does not apply to it.
  const deep = underCwd ? DEPTH[scope.depthOf](pattern) : pattern;
  const entries: GlobEntry[] = [{ pattern: deep, negated: false }];
  if (underCwd) {
    for (const carve of scope.carveOuts) {
      if (isUsablePattern(carve.pattern)) entries.push({ pattern: carve.pattern, negated: true });
    }
  }
  return gitignoreMatches(compileGlobs(entries, paths.platform), relative, scope.directory);
}

/**
 * Whether the path rule covers the path `call` acts on, with the `!` rules that carve paths out of it
 * (empty when the rule is matched alone). A `!` rule itself never covers a path.
 */
export function matchPathRule(
  rule: PermissionRule,
  call: PreparedCall,
  ctx: MatchContext,
  carveOuts: readonly PathSpecifier[],
): boolean {
  const specifier = pathSpecifierOf(rule);
  if (specifier === undefined || specifier.negated) return false;
  const forms = callPaths(rule, call, ctx.paths);
  if (forms === undefined) return false;
  const scope: Scope = {
    rule,
    specifier,
    paths: ctx.paths,
    carveOuts,
    directory: searchesDirectory(call.toolName),
    depthOf: ctx.depthOf ?? rule.behavior,
  };
  return COMBINE[rule.behavior](forms, (form) => matchesPath(scope, form));
}

/**
 * Tools whose path rules "are accepted but never match": "Claude Code checks file permissions
 * against `Edit(path)` and `Read(path)` rules. It accepts a rule with a path other than `*` for one of
 * the tools below but doesn't match a read, search, or edit against it" (permissions.md; it lists the
 * legacy MultiEdit with Write and NotebookEdit). `Tool(*)`
 * is read as every use of the tool, because the docs ask for the bare name for that. LSP is in the
 * Read format of tools-reference.md but its input has no path field the docs name: a deny or ask rule
 * on it covers every call and an allow rule none, the safe side (spec/judgments.md).
 */
const UNMATCHED_FORMS: ReadonlySet<string> = new Set([
  'Write',
  'Glob',
  'Grep',
  'NotebookEdit',
  'MultiEdit',
]);
/** The matcher of the `read-path` and `edit-path` rule formats. */
export const matchFileRule: SpecifierMatcher = (rule, call, ctx) => {
  const { specifier } = rule;
  if (specifier?.form !== 'text') return false;
  const covered = COVERAGE.get(rule.value.toolName)?.[rule.behavior];
  if (covered === undefined) {
    return UNMATCHED_FORMS.has(rule.value.toolName)
      ? specifier.pattern.trim() === '*'
      : RESTRICTS[rule.behavior];
  }
  if (!covered.includes(call.toolName)) return false;
  return PATHLESS_CALLS.has(call.toolName) || matchPathRule(rule, call, ctx, []);
};

/**
 * Whether `rule` covers a call of a tool other than its own: an `Edit` rule reaches Write, a `Read`
 * rule Grep, and so on (`COVERAGE`). Only a text path rule on a named tool is routed.
 */
export function routesToCall(rule: PermissionRule, toolName: string): boolean {
  if (rule.toolGlob || rule.specifier?.form !== 'text') return false;
  return COVERAGE.get(rule.value.toolName)?.[rule.behavior].includes(toolName) === true;
}
