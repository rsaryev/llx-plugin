/**
 * Where a component of a session comes from, one concept for skills and agents (`SessionSkill.source`,
 * `CatalogAgent.source`): a plugin, named by the id the host uses for it, or a scope folder. A host
 * that attributes a row to its plugin reads `source.pluginId` of a `plugin` source the same way for
 * both, and never parses a scoped name. Judgment (spec/judgments.md): the docs name the scopes and
 * the plugin a component comes from, not a shape for them.
 */

/** A component a plugin brought: the plugin's id as the host names it (`name@marketplace`, or the bare name). */
export interface PluginSource {
  readonly kind: 'plugin';
  readonly pluginId: string;
}

/** A component read from a scope folder (`managed`, `user`, `project`...: the scopes differ per component). */
export interface FolderSource<S extends string> {
  readonly kind: 'folder';
  readonly scope: S;
}
