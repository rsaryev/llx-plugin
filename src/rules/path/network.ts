import type { PathContext, PreparedCall } from '../types.ts';
import { absolutePath, type Platform } from './posix.ts';
import { PATH_TOOLS, pathText, requestedPath } from './tools.ts';

/**
 * Network paths (permissions.md, "Network paths"): "A network path is one that can reach another
 * computer: on Windows, a UNC path such as `\\server\share\file`, and on macOS and Linux, a `/net`
 * automount path such as `/net/fileserver/notes.txt`." Reading one always prompts, whatever an allow
 * rule or a hook says; the host asks `readsNetworkPath` before it trusts a rule.
 */
const IS_NETWORK: { readonly [P in Platform]: (path: string) => boolean } = {
  windows: (path) => path.startsWith('\\\\') || path.startsWith('//'),
  posix: (path) => path === '/net' || path.startsWith('/net/'),
};

export const isNetworkPath = (path: string, platform: Platform): boolean =>
  IS_NETWORK[platform](path);

/**
 * Whether `call` is a read (Read, Grep, Glob) of a network path, by the path it names or any path it
 * resolves to. Other tools have their own checks.
 */
export function readsNetworkPath(call: PreparedCall, paths: PathContext): boolean {
  if (PATH_TOOLS.get(call.toolName)?.reads !== true) return false;
  // As written (a UNC path keeps its two slashes only there) and as resolved (`../../net/x`).
  const named = [pathText(call), requestedPath(call, paths)].filter(
    (path): path is string => path !== undefined,
  );
  const resolved = call.resolvedPaths ?? [];
  const candidates = [...named, ...resolved, ...resolved.map((path) => absolutePath(path, paths))];
  return candidates.some((path) => isNetworkPath(path, paths.platform));
}
