import { parsePluginRef, pluginNameOf } from '../format/marketplace/ids.ts';

/**
 * The `<plugin>` argument of the plugin commands (plugins/cli-reference.md, "claude plugin
 * commands": "a `<plugin>` argument is a plugin `name` or `name@marketplace`. When two marketplaces
 * offer the same name, use the qualified form"; "plugin update", "Update by bare name": a bare name
 * "matches against your installed plugins"; when the same name is installed from different
 * marketplaces "the command refuses ... and lists the qualified `plugin-name@marketplace-name`
 * commands to run instead"). Pure over the ids the host lists.
 */

/** The name part of an id (`formatter` of `formatter@my-marketplace`). */
export const nameOf = pluginNameOf;

/**
 * The ids of `ids` the argument names: a qualified reference matches one id exactly, a bare name
 * every id with that name. No hit is "not installed"; two or more are ambiguous.
 */
export function matchingIds(text: string, ids: readonly string[]): readonly string[] {
  const ref = parsePluginRef(text);
  if (ref === undefined) return [];
  const unique = [...new Set(ids)];
  return unique.filter((id) =>
    ref.marketplace === undefined ? nameOf(id) === ref.name : id === text,
  );
}

/** The refusal of an ambiguous bare name: the qualified commands to run instead. */
export const qualifiedCommands = (verb: string, ids: readonly string[]): readonly string[] =>
  ids.map((id) => `claude plugin ${verb} ${id}`);
