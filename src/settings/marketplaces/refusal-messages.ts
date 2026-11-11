/**
 * The policy refusals a user reads (plugins/troubleshooting.md, "Policy refusals"): the line the
 * command prints, one function per entry. The host prints them; the kit only words them.
 *
 * Judgment (spec/judgments.md): the docs give each message's first line and the facts the rest
 * carries, not every word, so the second sentences below follow those facts.
 */

/** `Plugins from ~/.claude/skills/ are blocked ...`: `claude plugin init` or `enable` on a skills-directory plugin. */
export const skillsDirectoryBlockedMessage = (): string =>
  "Plugins from ~/.claude/skills/ are blocked by your organization's managed settings (strictKnownMarketplaces or blockedMarketplaces). " +
  'Ask your administrator to add {"source":"skills-dir"} to strictKnownMarketplaces or remove it from blockedMarketplaces.';

/** `Command-sourced plugins are disabled ...`: an install or update of a plugin with a `command` source. */
export const commandSourceDisabledMessage = (): string =>
  "Command-sourced plugins are disabled by your organization's managed settings. " +
  'The plugin was not installed or updated and its command was not run.';

/** Why a plugin is refused: its own entry, its marketplace, or a dependency. */
export type PluginBlock =
  | { readonly kind: 'plugin'; readonly action: 'install' | 'enable' }
  | { readonly kind: 'marketplace'; readonly marketplace: string }
  | { readonly kind: 'dependency'; readonly dependency: string };

const ENDINGS: Record<'install' | 'enable', string> = { install: 'installed', enable: 'enabled' };

/** What follows the name, per kind of block: a strategy per member of the union. */
const BLOCKS: { [K in PluginBlock['kind']]: (block: Extract<PluginBlock, { kind: K }>) => string } =
  {
    marketplace: (block) =>
      `is from marketplace "${block.marketplace}", which is blocked by your organization's policy`,
    dependency: (block) =>
      `depends on "${block.dependency}", which is blocked by your organization's policy`,
    plugin: (block) =>
      `is blocked by your organization's policy and cannot be ${ENDINGS[block.action]}`,
  };

/** `Plugin "<name>" is blocked by your organization's policy ...` in its three forms. */
export function pluginBlockedMessage(name: string, block: PluginBlock): string {
  const describe = BLOCKS[block.kind] as (each: PluginBlock) => string; // the registry is typed per member; the key picks the matching one
  return `Plugin "${name}" ${describe(block)}`;
}
