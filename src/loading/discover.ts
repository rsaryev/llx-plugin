import type { PluginIssue } from '../format/issues.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';
import type { PluginFiles } from '../ports/index.ts';
import { discoverBin, discoverConfig, discoverSettings } from './discover-config.ts';
import { discoverListed } from './discover-listed.ts';
import type { Discovered, DiscoveredFile } from './discovered.ts';
import { locateContext, type LocateOptions } from '../format/locate.ts';

const isSkillFolder = (file: DiscoveredFile): boolean => file.directory !== undefined;

/**
 * The skill folders of the commands scan, then the `skills/` ones it did not already find: a
 * `commands` path naming `./skills/` loads each folder once (oracle 2.1.319, spec/judgments.md).
 */
function skillFolders(
  fromCommands: readonly DiscoveredFile[],
  fromSkills: readonly DiscoveredFile[],
): DiscoveredFile[] {
  const first = fromCommands.filter(isSkillFolder);
  const seen = new Set(first.map((file) => file.directory));
  return [...first, ...fromSkills.filter((file) => !seen.has(file.directory))];
}

/**
 * What decides whether a declared path leaves the plugin, the signal of the reads, and whether the
 * default `skills/` is scanned (`EntryMerge.scanDefaultSkills`; default true).
 */
export type DiscoverOptions = LocateOptions & { readonly scanDefaultSkills?: boolean };

/**
 * Finds every component of a plugin folder (plugins/manifest-reference.md, "Standard layout", "Path
 * rules", "How each key combines with its default location") through `PluginFiles` alone: the
 * default locations and the manifest's paths, each key combined with its default by its own rule,
 * containment and existence checked, nothing parsed. `pluginName` is what components are namespaced
 * under and what names a skill at the plugin root; `locateContext` sets the platform default.
 */
export async function discoverComponents(
  files: PluginFiles,
  manifest: PluginManifest | undefined,
  pluginName: string,
  options: DiscoverOptions = {},
): Promise<Discovered> {
  const context = {
    ...locateContext(files, options),
    manifest,
    pluginName,
    scanDefaultSkills: options.scanDefaultSkills ?? true,
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
    // A skill folder a commands scan found is a skill, ahead of `skills/` (oracle 2.1.319, walk.ts).
    skills: skillFolders(commands.found, skills.found),
    commands: commands.found.filter((file) => !isSkillFolder(file)),
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
