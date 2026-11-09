import type { PortFailure } from '../../ports/failure.ts';
import type { PathResolver } from '../../ports/path-resolver.ts';
import type { PathContext, PermissionRule, PreparedCall, ToolCall } from '../types.ts';
import { anchorPattern } from './anchor.ts';
import { pathSpecifierOf } from './file-rules.ts';
import { dirnameOf, hasGlobSyntax, resolvePath } from './posix.ts';
import { requestedPath } from './tools.ts';

/**
 * Symlinks (permissions.md, "Symlinks"): "the permission check covers two paths: the one Claude
 * requested and the file it resolves to". Matching reads `PreparedCall.resolvedPaths`; this file
 * fills it through the host's `PathResolver`.
 */

/**
 * Where `path` really is. A file about to be written does not exist, but "a directory on the way to
 * the file" may be a link, so the nearest existing parent is resolved and the rest appended. A
 * `PortFailure` (a loop) is returned, never swallowed: "the Read, Edit, and Write tools refuse the
 * operation".
 */
async function realLocation(
  path: string,
  resolver: PathResolver,
  signal: AbortSignal | undefined,
): Promise<string | PortFailure | undefined> {
  const missing: string[] = [];
  let current = path;
  for (;;) {
    const real = await resolver.realpath(current, signal);
    if (real !== undefined) {
      return typeof real === 'string' ? resolvePath(real, missing.join('/')) : real;
    }
    if (current === '/') return undefined;
    const parent = dirnameOf(current);
    missing.unshift(current.slice(parent === '/' ? 1 : parent.length + 1));
    current = parent;
  }
}

/**
 * A call with the real location of its path, ready for the path rules. A call whose path is not a
 * link comes back as it was; one with no path is untouched and the resolver is not asked.
 */
export async function prepareCall(
  call: ToolCall,
  paths: PathContext,
  resolver: PathResolver,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<PreparedCall | PortFailure> {
  const requested = requestedPath(call, paths);
  if (requested === undefined) return call;
  const real = await realLocation(requested, resolver, signal);
  if (real === undefined || typeof real !== 'string') return real ?? call;
  return real === requested ? call : { ...call, resolvedPaths: [real] };
}

/** The directory a rule names before its first wildcard: `/vendor/pkg/*.js` names `vendor/pkg`. */
function literalDirectory(rule: PermissionRule, paths: PathContext): string | undefined {
  const specifier = pathSpecifierOf(rule);
  if (specifier === undefined || specifier.negated) return undefined;
  const { root, pattern, underCwd } = anchorPattern(specifier, rule.source, paths);
  if (underCwd) return undefined;
  const literal = pattern.split('/').filter(Boolean);
  const stop = literal.findIndex(hasGlobSyntax);
  const kept = stop === -1 ? literal : literal.slice(0, stop);
  return kept.length === 0 ? undefined : resolvePath(root, kept.join('/'));
}

/**
 * The real location of every directory a `//`, `~/` or `/` deny or ask rule is written through:
 * "On macOS and Linux, a deny or ask rule written through a symlinked directory ... also applies at
 * the directory's real location. For example, on macOS, where `/etc` resolves to `/private/etc`,
 * `Read(//etc/**)` blocks `/private/etc/hosts` too." Only the directories that are links come back.
 * A host puts the map in `PathContext.realDirectories`. Windows has none ("On macOS and Linux").
 */
export async function resolveRuleDirectories(
  rules: readonly PermissionRule[],
  paths: PathContext,
  resolver: PathResolver,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<ReadonlyMap<string, string>> {
  const found = new Map<string, string>();
  if (paths.platform !== 'posix') return found;
  const asked = new Set<string>();
  for (const rule of rules) {
    const directory = rule.behavior === 'allow' ? undefined : literalDirectory(rule, paths);
    if (directory === undefined || asked.has(directory)) continue;
    asked.add(directory);
    const real = await resolver.realpath(directory, signal);
    if (typeof real === 'string' && real !== directory) found.set(directory, real);
  }
  return found;
}
