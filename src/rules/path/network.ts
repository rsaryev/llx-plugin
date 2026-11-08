import type { PathContext, PreparedCall } from '../types.ts';
import type { Platform } from './posix.ts';
import { PATH_TOOLS, pathText } from './tools.ts';

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
  const named = pathText(call);
  const candidates = [...(named === undefined ? [] : [named]), ...(call.resolvedPaths ?? [])];
  return candidates.some((path) => isNetworkPath(path, paths.platform));
}
