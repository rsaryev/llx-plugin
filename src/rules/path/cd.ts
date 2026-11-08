import type { MatchContext, PermissionRule } from '../types.ts';
import { anchorPattern, readPathSpecifier } from './anchor.ts';
import { absolutePath } from './posix.ts';

/**
 * `Cd(path)` rules (permissions.md, "Cd"): "Path patterns share the `//`, `~/`, and `/` anchors from
 * Read and Edit rules, but matching is anchored to the whole directory path rather than
 * gitignore-style. `*` matches exactly one path segment and `**` matches across segments. A trailing
 * `/**` also matches its named root."
 */
const escapeLiteral = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** One path segment of a pattern as regular-expression source; `**` is handled between segments. */
const segmentSource = (segment: string): string =>
  segment.split('*').map(escapeLiteral).join('[^/]*');

/** A directory pattern as a regular expression over the whole POSIX path (root and pattern joined). */
function directoryExpression(root: string, pattern: string): RegExp {
  const segments = pattern.split('/').filter(Boolean);
  const base = root === '/' ? '' : escapeLiteral(root);
  const parts = segments.map((segment, index) => {
    const last = index === segments.length - 1;
    if (segment !== '**') return `/${segmentSource(segment)}`;
    // `**` spans zero or more segments; at the end it also covers the named root.
    return last ? '(?:/.*)?' : '(?:/[^/]+)*';
  });
  return new RegExp(`^${base}${parts.join('')}$`);
}

/** A directory a `/cd` moves to: where it resolves, and every spelling it was reached by. */
export interface CdTarget {
  readonly resolved: string;
  readonly spellings: readonly string[];
}

/**
 * Whether a `Cd(<pattern>)` rule covers the target: "Deny rules check every spelling of the target,
 * including each symlink hop it resolves through"; an allow rule needs "the resolved target
 * directory" to match. A bare `Cd` rule has no pattern and is the host's to read.
 */
export function matchCdRule(rule: PermissionRule, target: CdTarget, ctx: MatchContext): boolean {
  const { specifier } = rule;
  if (specifier?.form !== 'text') return false;
  const parsed = readPathSpecifier(specifier.pattern);
  if (parsed.negated) return false;
  const { root, pattern } = anchorPattern(parsed, rule.source, ctx.paths);
  const expression = directoryExpression(root, pattern.replace(/^\//, ''));
  const candidates =
    rule.behavior === 'allow' ? [target.resolved] : [target.resolved, ...target.spellings];
  return candidates.some((path) => expression.test(absolutePath(path, ctx.paths)));
}
