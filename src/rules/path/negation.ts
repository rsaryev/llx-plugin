import type { PermissionBehavior } from '../../protocol/official.ts';
import type { MatchContext, PermissionRule, PreparedCall, RuleSource } from '../types.ts';
import type { PathSpecifier } from './anchor.ts';
import { matchPathRule, pathSpecifierOf } from './file-rules.ts';
import { requestedPath } from './tools.ts';

/**
 * `!` negation (permissions.md, "Special characters and `!` negation"): "A deny or ask pattern that
 * starts with `!` is a gitignore negation. It carves the paths it matches out of the `path` or
 * `./path` rules listed before it." The carve-out reaches only rules of the same source, and only
 * deny and ask rules carve (an allow rule that starts with `!` approves nothing).
 */
const CARVES: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};

/** What makes two rules come from one settings file or flag: a registry typed over the kinds. */
const SOURCE_IDENTITY: { readonly [K in RuleSource['kind']]: (source: RuleSource) => string } = {
  managed: () => 'managed',
  'embedder-managed': () => 'embedder-managed',
  project: () => 'project',
  local: () => 'local',
  user: () => 'user',
  'flag-settings': (source) => `flag-settings:${'file' in source ? source.file : ''}`,
  cli: () => 'cli',
  session: () => 'session',
};

const identity = (source: RuleSource): string => SOURCE_IDENTITY[source.kind](source);

/** The `!` rules after `rule` in the list that carve out of it: same source, behaviour and tool. */
function carveOutsAfter(rule: PermissionRule, later: readonly PermissionRule[]): PathSpecifier[] {
  const found: PathSpecifier[] = [];
  for (const other of later) {
    const specifier = pathSpecifierOf(other);
    const sameList =
      other.behavior === rule.behavior &&
      other.value.toolName === rule.value.toolName &&
      identity(other.source) === identity(rule.source);
    if (sameList && specifier?.negated === true) found.push(specifier);
  }
  return found;
}

/**
 * Whether `rules[index]`, which matched `call`, is carved out of by a later `!` rule of its own
 * source (so it covers the call no longer).
 */
export function isCarvedOut(
  rules: readonly PermissionRule[],
  index: number,
  call: PreparedCall,
  ctx: MatchContext,
): boolean {
  const rule = rules[index];
  if (rule === undefined || !CARVES[rule.behavior]) return false;
  // A call with no path the kit reads (LSP) is never carved out: there is nothing for a `!` to match.
  if (requestedPath(call, ctx.paths) === undefined) return false;
  const carveOuts = carveOutsAfter(rule, rules.slice(index + 1));
  return carveOuts.length > 0 && !matchPathRule(rule, call, ctx, carveOuts);
}
