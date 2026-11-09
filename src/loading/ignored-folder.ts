import { STANDARD_LAYOUT, declaredKey, type ComponentKind } from '../format/layout.ts';
import { warning, type PluginIssue } from '../format/issues.ts';
import { defaultFolderIgnored } from '../format/messages.ts';
import { rootRelative } from '../format/locate.ts';
import type { DiscoverContext } from './discovered.ts';

const isInside = (folder: string, path: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);

/**
 * The warning for a default folder that exists and that a replacing manifest key leaves unscanned
 * (plugins/manifest-reference.md, "How each key combines with its default location"): "To avoid the
 * warning, set the key to a path inside that folder", and listing the folder itself keeps it. Only a
 * kind whose key replaces its default has a folder to ignore.
 */
export async function ignoredFolderIssues(
  kind: ComponentKind,
  declaredPaths: readonly string[],
  context: DiscoverContext,
): Promise<PluginIssue[]> {
  const { folder } = STANDARD_LAYOUT[kind];
  const declared = declaredKey(context.manifest, kind);
  if (folder === undefined || declared === undefined) return [];
  const present = await context.files.stat(folder, context.signal);
  if (!present?.isDirectory) return [];
  const keeps = declaredPaths.some((path) => isInside(folder, rootRelative(path)));
  return keeps ? [] : [warning(declared.key, defaultFolderIgnored(folder, declared.key))];
}
