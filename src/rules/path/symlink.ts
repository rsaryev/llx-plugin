import { RESTRICTS } from '../restricts.ts';
import type { PortFailure } from '../../ports/failure.ts';
import type { PathResolver } from '../../ports/path-resolver.ts';
import type { PathContext, PermissionRule, PreparedCall, ToolCall } from '../types.ts';
import { anchorPattern } from './anchor.ts';
import { pathSpecifierOf } from './file-rules.ts';
import { dirnameOf, hasGlobSyntax, normalizeAbsolute, resolvePath, toPosixPath } from './posix.ts';
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

/**
 * The directories a deny or ask rule is written through: its anchor (the current directory of a
 * `./` rule, the home of a `~/` rule, the settings source's folder of a `/` rule) and, for a pattern
 * that is not the current directory's own, the directory it names before its first wildcard
 * (`/vendor/pkg/*.js` names `vendor/pkg`). A `./` rule may match at any depth below its anchor, so
 * the anchor alone stands for it.
 */
function ruleDirectories(rule: PermissionRule, paths: PathContext): readonly string[] {
  const specifier = pathSpecifierOf(rule);
  if (specifier === undefined || specifier.negated) return [];
  const { root, pattern, underCwd } = anchorPattern(specifier, rule.source, paths);
  if (underCwd) return [root];
  const literal = pattern.split('/').filter(Boolean);
  const stop = literal.findIndex(hasGlobSyntax);
  const kept = stop === -1 ? literal : literal.slice(0, stop);
  return kept.length === 0 ? [root] : [root, resolvePath(root, kept.join('/'))];
}

/** The working directories in the kit's path form, which the scope checks read (`decide/scope.ts`). */
const workingDirectories = (paths: PathContext): readonly string[] =>
  [paths.primaryWorkingDirectory, ...paths.additionalDirectories].map((directory) =>
    normalizeAbsolute(toPosixPath(directory, paths.platform)),
  );

/**
 * The real location of every directory a `//`, `~/`, `/` or `./` deny or ask rule is written
 * through, and of every working directory: "On macOS and Linux, a deny or ask rule written through
 * a symlinked directory ... also applies at the directory's real location. For example, on macOS,
 * where `/etc` resolves to `/private/etc`, `Read(//etc/**)` blocks `/private/etc/hosts` too." The
 * anchor counts as such a directory, so a `./private/**` rule under a current directory reached
 * through a link (`/var/proj` is `/private/var/proj`) covers the real spelling too, and a working
 * directory reached through a link holds the files that resolve below its real location (judgments,
 * spec/judgments.md). Only the directories that are links come back. A host puts the map in
 * `PathContext.realDirectories`. Windows has none ("On macOS and Linux").
 */
export async function resolveRuleDirectories(
  rules: readonly PermissionRule[],
  paths: PathContext,
  resolver: PathResolver,
  { signal }: { readonly signal?: AbortSignal | undefined } = {},
): Promise<ReadonlyMap<string, string>> {
  const found = new Map<string, string>();
  if (paths.platform !== 'posix') return found;
  const restricting = rules.filter((rule) => RESTRICTS[rule.behavior]);
  const asked = new Set([
    ...restricting.flatMap((rule) => ruleDirectories(rule, paths)),
    ...workingDirectories(paths),
  ]);
  asked.delete('/');
  for (const directory of asked) {
    const real = await resolver.realpath(directory, signal);
    if (typeof real === 'string' && real !== directory) found.set(directory, real);
  }
  return found;
}
