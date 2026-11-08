import type { Locations } from '../ports/index.ts';
import type { Plugin } from './plugin-model.ts';

/**
 * Executables (plugins/manifest-reference.md, "Standard layout"; plugins/components.md,
 * "Executables"). Putting a directory on the Bash tool's `PATH` is the host's effect; what the kit
 * owns is which directory, where it goes among the user's own entries, and which hosts take a plugin
 * that has one.
 */

/** The absolute `bin/` directory of a plugin, only when it has one ("while the plugin is enabled"). */
export function binPathEntries(
  plugin: Pick<Plugin, 'hasBin'>,
  pluginId: string,
  locations: Locations,
): string[] {
  return plugin.hasBin ? [locations.joinPath(locations.pluginRoot(pluginId), 'bin')] : [];
}

/**
 * The `PATH` entries with plugin `bin/` directories added: "Plugin `bin/` directories come after the
 * user's own `PATH` entries, so a plugin can't shadow `git`, `ls`, or another system command". A
 * directory the user already lists keeps its own position.
 */
export function pathWithPluginBins(
  userEntries: readonly string[],
  binDirectories: readonly string[],
): string[] {
  const own = new Set(userEntries);
  return [...userEntries, ...new Set(binDirectories.filter((directory) => !own.has(directory)))];
}

/** Where a plugin can be installed: Claude Code and the two hosted surfaces the docs name. */
export const DISTRIBUTION_TARGETS = ['claude-code', 'claude-ai', 'cowork'] as const;
export type DistributionTarget = (typeof DISTRIBUTION_TARGETS)[number];

export type Distribution =
  | { readonly installable: true }
  | { readonly installable: false; readonly reason: string };

const HOSTED_REFUSAL = (surface: string): Distribution => ({
  installable: false,
  reason: `${surface} doesn't install a plugin that has a top-level bin/ directory`,
});

/**
 * One strategy per target: "claude.ai and Cowork don't install a plugin that has this directory,
 * including one you distribute through claude.ai organization settings". The target names are the
 * kit's wording of that sentence (judgment).
 */
const TARGETS: {
  readonly [T in DistributionTarget]: (plugin: Pick<Plugin, 'hasBin'>) => Distribution;
} = {
  'claude-code': () => ({ installable: true }),
  'claude-ai': (plugin) => (plugin.hasBin ? HOSTED_REFUSAL('claude.ai') : { installable: true }),
  cowork: (plugin) => (plugin.hasBin ? HOSTED_REFUSAL('Cowork') : { installable: true }),
};

export const distribution = (
  plugin: Pick<Plugin, 'hasBin'>,
  target: DistributionTarget,
): Distribution => TARGETS[target](plugin);
