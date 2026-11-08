import { error, type PluginIssue } from '../format/issues.ts';
import { STANDARD_LAYOUT } from '../format/layout.ts';
import { readManifest } from '../format/manifest.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';
import type { CollectOptions } from '../format/mcp-sources.ts';
import { nameLoadIssues } from '../format/names.ts';
import type { PluginFiles } from '../ports/index.ts';
import { channelIssues } from './channels.ts';
import { COMPONENT_READERS } from './component-readers.ts';
import { discoverComponents } from './discover.ts';
import type { LoadedPlugin, Plugin } from './plugin-model.ts';
import { readJson } from './read-json.ts';
import type { ComponentValues, ReaderContext } from './reader-types.ts';

export interface LoadPluginInput {
  /** Read access to the plugin folder: its root is the plugin root. */
  readonly files: PluginFiles;
  /**
   * The name to load a plugin without a manifest under: "the plugin name then comes from the marketplace
   * entry, or from the directory name when you load the plugin with `--plugin-dir`"
   * (manifest-reference.md, "Manifest file"). The manifest's `name` wins when there is one.
   */
  readonly fallbackName?: string;
  /** Opens `.mcpb` and `.dxt` bundles named by `mcpServers`; without it a bundle is a warning. */
  readonly bundles?: CollectOptions['bundles'];
  /** The values saved for each bundled server's `user_config`. */
  readonly bundleSettings?: CollectOptions['bundleSettings'];
  readonly signal?: AbortSignal;
}

interface ManifestStep {
  /** Whether `.claude-plugin/plugin.json` exists. */
  readonly present: boolean;
  readonly manifest: PluginManifest | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Reads the optional manifest: absent is fine, unreadable JSON or a manifest with an error is not. */
async function loadManifest(files: PluginFiles, signal?: AbortSignal): Promise<ManifestStep> {
  const { location } = STANDARD_LAYOUT.manifest;
  if (!(await files.exists(location, signal))) {
    return { present: false, manifest: undefined, issues: [] };
  }
  const raw = await readJson(files, location, signal);
  if ('problem' in raw) {
    return {
      present: true,
      manifest: undefined,
      issues: [error(location, `${location} could not be read as JSON: ${raw.problem}`)],
    };
  }
  const read = readManifest(raw.value);
  return { present: true, manifest: read.manifest, issues: read.issues };
}

const NO_NAME =
  'The plugin has no manifest and no name to load it under: pass the marketplace entry name or the directory name';

/** The manifest's name, else the fallback; a manifest-less plugin with neither does not load (judgment). */
function nameOf(
  manifest: PluginManifest | undefined,
  fallbackName: string | undefined,
): { readonly name: string | undefined; readonly issues: readonly PluginIssue[] } {
  if (manifest) return { name: manifest.name, issues: [] };
  if (fallbackName === undefined) return { name: undefined, issues: [error('name', NO_NAME)] };
  const issues = nameLoadIssues(fallbackName);
  return { name: issues.length > 0 ? undefined : fallbackName, issues };
}

/** Runs every reader over what discovery found. */
async function readComponents(context: ReaderContext): Promise<{
  readonly values: ComponentValues;
  readonly issues: readonly PluginIssue[];
  /** A component failed so that the plugin does not load (oracle 2.1.319). */
  readonly rejected: boolean;
}> {
  const run = COMPONENT_READERS;
  const [skills, commands, agents, hooks, mcpServers, lspServers] = await Promise.all([
    run.skills(context),
    run.commands(context),
    run.agents(context),
    run.hooks(context),
    run.mcpServers(context),
    run.lspServers(context),
  ]);
  const [outputStyles, workflows, themes, monitors, bin, settings] = await Promise.all([
    run.outputStyles(context),
    run.workflows(context),
    run.themes(context),
    run.monitors(context),
    run.bin(context),
    run.settings(context),
  ]);
  return {
    values: {
      skills: skills.value,
      commands: commands.value,
      agents: agents.value,
      hooks: hooks.value,
      mcpServers: mcpServers.value,
      lspServers: lspServers.value,
      outputStyles: outputStyles.value,
      workflows: workflows.value,
      themes: themes.value,
      monitors: monitors.value,
      bin: bin.value,
      settings: settings.value,
    },
    rejected: [hooks, mcpServers].some((read) => read.rejectsPlugin === true),
    issues: [
      skills,
      commands,
      agents,
      hooks,
      mcpServers,
      lspServers,
      outputStyles,
      workflows,
      themes,
      monitors,
      bin,
      settings,
    ].flatMap((read) => [...read.issues]),
  };
}

/** The host's MCP bundle capabilities, as the readers take them. */
const mcpOptions = (input: LoadPluginInput): CollectOptions => ({
  ...(input.bundles && { bundles: input.bundles }),
  ...(input.bundleSettings && { bundleSettings: input.bundleSettings }),
  ...(input.signal && { signal: input.signal }),
});

/**
 * Loads a plugin folder into a typed `Plugin` (docs/API.md, "Loading"): the optional manifest, every
 * component in the standard layout and the manifest's paths, each reader's issues collected. Never
 * throws. The plugin is `undefined` only when it does not load at all: a manifest that is not valid
 * JSON or fails validation, no name to load it under, a guard hook that cannot be read or an inline
 * MCP server of the manifest that cannot be read (oracle 2.1.319, spec/judgments.md). Any other problem (a path that is missing or
 * escapes the plugin, a file Claude Code would skip) is an issue and skips that component, as the
 * docs say for paths ("the plugin loads without that component"); the rest loads (spec/judgments.md).
 */
export async function loadPlugin(input: LoadPluginInput): Promise<LoadedPlugin> {
  const { files, signal } = input;
  const step = await loadManifest(files, signal);
  if (step.present && !step.manifest) return { plugin: undefined, issues: step.issues };
  const named = nameOf(step.manifest, input.fallbackName);
  const issues: PluginIssue[] = [...step.issues, ...named.issues];
  if (named.name === undefined) return { plugin: undefined, issues };
  const discovered = await discoverComponents(files, step.manifest, named.name, signal);
  const context: ReaderContext = {
    files,
    manifest: step.manifest,
    pluginName: named.name,
    discovered,
    mcp: mcpOptions(input),
    ...(signal && { signal }),
  };
  const read = await readComponents(context);
  if (read.rejected) {
    return { plugin: undefined, issues: [...issues, ...discovered.issues, ...read.issues] };
  }
  const plugin: Plugin = {
    name: named.name,
    manifest: step.manifest,
    ...read.values,
    userConfig: step.manifest?.userConfig ?? {},
    hasBin: read.values.bin.present,
    bin: read.values.bin.files,
  };
  const channels = channelIssues(step.manifest, read.values.mcpServers);
  return { plugin, issues: [...issues, ...discovered.issues, ...read.issues, ...channels] };
}
