import { COMPONENT_KINDS, STANDARD_LAYOUT } from '../format/layout.ts';
import type { PluginIssue } from '../format/issues.ts';
import type { PluginFiles } from '../ports/files.ts';
import { fetchArchive, type ArchivePorts, type FetchedArchive } from './archive-source.ts';
import { ARCHIVE_LIMITS } from './fetch-plan.ts';
import { listSorted } from '../format/listing.ts';

/**
 * The plugins a session loads from where they are, not from a marketplace (plugins/create.md,
 * "Load a plugin for one session": "Load a plugin from a directory or `.zip`", "Load a folder of
 * plugins", "Load a plugin from a URL"; plugins/cli-reference.md, "Flags that load a plugin for
 * one session"): what a `--plugin-dir` argument is, whether a directory is one plugin or a folder
 * of them, which subfolders load, what happens when one appears or goes away mid-session, and how
 * `--plugin-url` archives are fetched. Pure over `PluginFiles`; the archive download goes through
 * the same ports as an `archive` source.
 */

const MANIFEST_FOLDER = '.claude-plugin';
const MANIFEST = `${MANIFEST_FOLDER}/plugin.json`;
const MARKETPLACE_FILE = `${MANIFEST_FOLDER}/marketplace.json`;

/** What a `--plugin-dir` argument names: "a directory or a `.zip` archive of one". */
export function pluginDirArgument(path: string): 'directory' | 'archive' {
  return /\.zip$/i.test(path) ? 'archive' : 'directory';
}

/** `--plugin-url`: "Repeat the flag, or pass the URLs space-separated in one quoted argument." */
export function pluginUrls(values: readonly string[]): readonly string[] {
  return values.flatMap((value) => value.split(/\s+/)).filter((url) => url !== '');
}

/** The first segment of every standard component location but the manifest's: what a plugin has at its top level. */
const COMPONENT_NAMES: ReadonlySet<string> = new Set([
  'SKILL.md',
  ...COMPONENT_KINDS.filter((kind) => kind !== 'manifest').flatMap((kind) => {
    const [first] = STANDARD_LAYOUT[kind].location.split('/');
    return first === undefined ? [] : [first];
  }),
]);

export interface PluginDirectoryReading {
  /** The directory is a folder that holds plugins, not a plugin itself. */
  readonly isFolder: boolean;
  /** The immediate subfolders that load, as separate plugins, in name order; none for a plugin. */
  readonly plugins: readonly string[];
}

async function subfolderPlugins(files: PluginFiles, signal?: AbortSignal): Promise<string[]> {
  const loaded: string[] = [];
  for (const entry of (await listSorted(files, '.', signal)) ?? []) {
    if (entry.isDirectory && (await files.exists(`${entry.name}/${MANIFEST}`, signal))) {
      loaded.push(entry.name);
    }
  }
  return loaded;
}

/**
 * "If the folder has no `.claude-plugin/` directory and no plugin components at its top level,
 * Claude Code treats it as a folder of plugins. Each immediate subfolder that has a
 * `.claude-plugin/plugin.json` manifest then loads as a separate plugin. Everything else in the
 * folder is skipped without an error, including a subfolder that has no manifest." A folder that
 * keeps a `.claude-plugin/marketplace.json` beside its plugin folders is one too, "as long as that
 * `.claude-plugin/` directory holds no `plugin.json`"; nothing is installed or enabled from the
 * marketplace file. Judgment (spec/judgments.md): the marketplace file counts only when no plugin
 * component is at the top level either, so a plugin that ships its own catalog stays a plugin.
 */
export async function readPluginDirectory(
  files: PluginFiles,
  signal?: AbortSignal,
): Promise<PluginDirectoryReading> {
  const names = ((await listSorted(files, '.', signal)) ?? []).map((entry) => entry.name);
  const hasComponents = names.some((name) => COMPONENT_NAMES.has(name));
  const hasManifest = await files.exists(MANIFEST, signal);
  const hasMarketplaceOnly = !hasManifest && (await files.exists(MARKETPLACE_FILE, signal));
  const hasFolder = names.includes(MANIFEST_FOLDER);
  const isFolder = !hasComponents && !hasManifest && (!hasFolder || hasMarketplaceOnly);
  return { isFolder, plugins: isFolder ? await subfolderPlugins(files, signal) : [] };
}

export interface FolderChange {
  readonly plugin: string;
  readonly change: 'load' | 'unload';
  /** False when the change is held for `/reload-plugins`: it "would invalidate the prompt cache". */
  readonly applied: boolean;
}

/**
 * What an interactive session does when the folder's plugins change after startup: "A subfolder you
 * add loads as a new plugin once its manifest exists. When you remove a subfolder, its plugin
 * unloads." A change that would invalidate the prompt cache "is held instead", and the message tells
 * you to run `/reload-plugins`. Names that did not change give no change.
 */
export function folderChanges(
  loaded: readonly string[],
  now: readonly string[],
  invalidatesPromptCache: boolean,
): readonly FolderChange[] {
  const applied = !invalidatesPromptCache;
  return [
    ...now
      .filter((name) => !loaded.includes(name))
      .map((plugin) => ({ plugin, change: 'load' as const, applied })),
    ...loaded
      .filter((name) => !now.includes(name))
      .map((plugin) => ({ plugin, change: 'unload' as const, applied })),
  ];
}

export interface SessionArchives {
  readonly loaded: readonly { readonly url: string; readonly archive: FetchedArchive }[];
  /** "A plugin load error that you can review in the `/plugin` manager's Errors tab." */
  readonly errors: readonly { readonly url: string; readonly issue: PluginIssue }[];
}

/**
 * `--plugin-url`: the archives are downloaded at startup. "If Claude Code can't fetch the archive,
 * or the archive is invalid, it starts without the plugin and records a plugin load error": one
 * bad URL never stops the others, nor the session. Judgment (spec/judgments.md): the download and
 * extraction limits are those of an `archive` source, and no header is sent.
 */
export async function fetchSessionArchives(
  urls: readonly string[],
  ports: ArchivePorts,
  signal: AbortSignal,
): Promise<SessionArchives> {
  const loaded: { url: string; archive: FetchedArchive }[] = [];
  const errors: { url: string; issue: PluginIssue }[] = [];
  for (const url of pluginUrls(urls)) {
    const fetched = await fetchArchive(
      { kind: 'archive', url, limits: ARCHIVE_LIMITS, headers: {}, rootDepth: 'top-or-one-down' },
      ports,
      signal,
    );
    if ('severity' in fetched) errors.push({ url, issue: fetched });
    else loaded.push({ url, archive: fetched });
  }
  return { loaded, errors };
}
