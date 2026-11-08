import { escapesAsWritten } from '../format/paths.ts';
import { error, type PluginIssue } from '../format/issues.ts';
import { pathEscapes } from '../format/messages.ts';
import { linkReach } from './link-rule.ts';

/**
 * A component path that leaves the plugin (plugins/loading.md, "Paths that escape the plugin
 * directory"): "Whether a plugin loads in place or from a cached copy, Claude Code doesn't let it
 * declare components outside its own directory", whether the path is declared in `plugin.json` or
 * in a marketplace entry. Rejected: a path that points outside as written, a symlink that leads
 * outside the plugin "other than links between plugins within one marketplace", and on macOS and
 * Linux a path with a backslash. The plugin "loads without that component".
 */
export interface DeclaredPath {
  /** The field that declared the path: `commands`, `hooks`... */
  readonly component: string;
  /** The path as written. */
  readonly written: string;
  readonly platform: 'posix' | 'windows';
  /** Where the path really leads when it is, or crosses, a symlink (a real path, `/`-separated); absent when it is not. */
  readonly resolvesTo?: string;
  readonly pluginRoot: string;
  /** The marketplace the plugin is in, when it is in one. */
  readonly marketplaceRoot?: string;
}

/** The issue that drops the path, or `undefined` when it stays inside the plugin. */
export function escapedPathIssue(path: DeclaredPath): PluginIssue | undefined {
  if (escapesAsWritten(path.written, path.platform)) {
    return error(path.component, pathEscapes(path.component, path.written));
  }
  if (path.resolvesTo === undefined) return undefined;
  const reach = linkReach({
    target: path.resolvesTo,
    pluginRoot: path.pluginRoot,
    ...(path.marketplaceRoot === undefined ? {} : { marketplaceRoot: path.marketplaceRoot }),
  });
  return reach === 'outside'
    ? error(path.component, pathEscapes(path.component, path.written, path.resolvesTo))
    : undefined;
}
