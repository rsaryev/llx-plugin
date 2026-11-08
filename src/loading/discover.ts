import type { PluginIssue } from '../format/issues.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';
import type { PluginFiles } from '../ports/index.ts';
import { discoverBin, discoverConfig, discoverSettings } from './discover-config.ts';
import { discoverListed } from './discover-listed.ts';
import type { Discovered } from './discovered.ts';
import type { LocateContext } from './locate.ts';

/** What decides whether a declared path leaves the plugin, and the signal of the reads. */
export type DiscoverOptions = Partial<Pick<LocateContext, 'platform' | 'roots' | 'signal'>>;

/**
 * Finds every component of a plugin folder (plugins/manifest-reference.md, "Standard layout", "Path
 * rules", "How each key combines with its default location") through `PluginFiles` alone: the
 * default locations and the manifest's paths, each key combined with its default by its own rule,
 * containment and existence checked, nothing parsed. `pluginName` is what components are namespaced
 * under and what names a skill at the plugin root. `platform` defaults to `posix`, the stricter
 * one: a backslash in a declared path escapes there.
 */
export async function discoverComponents(
  files: PluginFiles,
  manifest: PluginManifest | undefined,
  pluginName: string,
  options: DiscoverOptions = {},
): Promise<Discovered> {
  const { signal, roots, platform = 'posix' } = options;
  const context = {
    files,
    manifest,
    pluginName,
    platform,
    ...(signal && { signal }),
    ...(roots && { roots }),
  };
  const [skills, commands, agents, outputStyles, workflows, themes] = await Promise.all([
    discoverListed('skills', context),
    discoverListed('commands', context),
    discoverListed('agents', context),
    discoverListed('outputStyles', context),
    discoverListed('workflows', context),
    discoverListed('themes', context),
  ]);
  const [hooks, lspServers, monitors, settings, bin] = await Promise.all([
    discoverConfig('hooks', context),
    discoverConfig('lspServers', context),
    discoverConfig('monitors', context),
    discoverSettings(context),
    discoverBin(context),
  ]);
  const issues: PluginIssue[] = [
    skills,
    commands,
    agents,
    outputStyles,
    workflows,
    themes,
    hooks,
    lspServers,
    monitors,
    settings,
  ].flatMap((step) => [...step.issues]);
  return {
    skills: skills.found,
    commands: commands.found,
    agents: agents.found,
    outputStyles: outputStyles.found,
    workflows: workflows.found,
    themes: themes.found,
    hooks: hooks.found,
    lspServers: lspServers.found,
    monitors: monitors.found,
    settingsFile: settings.found[0],
    bin,
    issues,
  };
}
