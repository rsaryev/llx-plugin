import type { PermissionBehavior } from '../../protocol/official.ts';
import type { SpecifierMatcher } from '../matchers.ts';
import type { MatchContext, PathContext, PermissionRule, PreparedCall } from '../types.ts';
import { anchorPattern, readPathSpecifier, type PathSpecifier } from './anchor.ts';
import { DEPTH } from './depth.ts';
import { compileGlobs, globMatches, isUsablePattern, type GlobEntry } from './glob.ts';
import { absolutePath, relativeWithin, resolvePath } from './posix.ts';
import { COVERAGE, requestedPath, searchesDirectory } from './tools.ts';

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
const WITH_REAL_DIRECTORIES: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

function spellings(path: string, directories: PathContext['realDirectories']): string[] {
  const found: string[] = [];
  for (const [written, real] of directories ?? []) {
    const rest = relativeWithin(real, path);
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
  if (!WITH_REAL_DIRECTORIES[rule.behavior]) return forms;
  return [...forms, ...forms.flatMap((form) => spellings(form, paths.realDirectories))];
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

/**
 * The guard an unusable pattern still gives: a deny or ask rule keeps its exact path, an allow rule
 * approves nothing.
 */
const GUARDS_EXACT_PATH: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

/** Everything one rule is matched with, besides the path. */
interface Scope {
  readonly rule: PermissionRule;
  readonly specifier: PathSpecifier;
  readonly paths: PathContext;
  /** `!` rules from the same source listed after the rule (`negation.ts`). */
  readonly carveOuts: readonly PathSpecifier[];
  readonly directory: boolean;
}

function matchesPath(scope: Scope, path: string): boolean {
  const { rule, specifier, paths } = scope;
  const { root, pattern, underCwd } = anchorPattern(specifier, rule.source, paths);
  if (!isUsablePattern(pattern)) {
    return GUARDS_EXACT_PATH[rule.behavior] && path === resolvePath(root, pattern);
  }
  const relative = relativeWithin(root, path);
  if (relative === undefined) return false;
  // A `../` pattern names two directories, so the one-directory depth rule does not apply to it.
  const deep = underCwd ? DEPTH[rule.behavior](pattern) : pattern;
  const entries: GlobEntry[] = [{ pattern: deep, negated: false }];
  if (underCwd) {
    for (const carve of scope.carveOuts) {
      if (isUsablePattern(carve.pattern)) entries.push({ pattern: carve.pattern, negated: true });
    }
  }
  return globMatches(compileGlobs(entries, paths.platform), relative, scope.directory);
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
  };
  return COMBINE[rule.behavior](forms, (form) => matchesPath(scope, form));
}

/**
 * Tools whose path rules "are accepted but never match": "Claude Code checks file permissions
 * against `Edit(path)` and `Read(path)` rules. It accepts a rule with a path other than `*` for one of
 * the tools below but doesn't match a read, search, or edit against it" (permissions.md). `Tool(*)`
 * is read as every use of the tool, because the docs ask for the bare name for that. LSP is in the
 * Read format of tools-reference.md but its input has no path field the docs name: a deny or ask rule
 * on it covers every call and an allow rule none, the safe side (spec/judgments.md).
 */
const UNMATCHED_FORMS: ReadonlySet<string> = new Set(['Write', 'Glob', 'Grep', 'NotebookEdit']);
const COVERS_UNREADABLE: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

/** The matcher of the `read-path` and `edit-path` rule formats. */
export const matchFileRule: SpecifierMatcher = (rule, call, ctx) => {
  const { specifier } = rule;
  if (specifier?.form !== 'text') return false;
  const covered = COVERAGE.get(rule.value.toolName)?.[rule.behavior];
  if (covered === undefined) {
    return UNMATCHED_FORMS.has(rule.value.toolName)
      ? specifier.pattern.trim() === '*'
      : COVERS_UNREADABLE[rule.behavior];
  }
  return covered.includes(call.toolName) && matchPathRule(rule, call, ctx, []);
};

/**
 * Whether `rule` covers a call of a tool other than its own: an `Edit` rule reaches Write, a `Read`
 * rule Grep, and so on (`COVERAGE`). Only a text path rule on a named tool is routed.
 */
export function routesToCall(rule: PermissionRule, toolName: string): boolean {
  if (rule.toolGlob || rule.specifier?.form !== 'text') return false;
  return COVERAGE.get(rule.value.toolName)?.[rule.behavior].includes(toolName) === true;
}
