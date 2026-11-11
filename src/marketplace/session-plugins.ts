import type { PluginIssue } from '../format/issues.ts';
import { fetchArchive, type ArchivePorts, type FetchedArchive } from './archive-source.ts';
import { ARCHIVE_LIMITS } from './fetch-plan.ts';

/**
 * The plugins a session loads from where they are, not from a marketplace (plugins/create.md,
 * "Load a plugin for one session": "Load a plugin from a directory or `.zip`", "Load a folder of
 * plugins", "Load a plugin from a URL"; plugins/cli-reference.md, "Flags that load a plugin for
 * one session"): what a `--plugin-dir` argument is, whether a directory is one plugin or a folder
 * of them, which subfolders load, what happens when one appears or goes away mid-session, and how
 * `--plugin-url` archives are fetched. Pure over `PluginFiles`; the archive download goes through
 * the same ports as an `archive` source.
 */

/** What a `--plugin-dir` argument names: "a directory or a `.zip` archive of one". */
export function pluginDirArgument(path: string): 'directory' | 'archive' {
  return /\.zip$/i.test(path) ? 'archive' : 'directory';
}

/** `--plugin-url`: "Repeat the flag, or pass the URLs space-separated in one quoted argument." */
export function pluginUrls(values: readonly string[]): readonly string[] {
  return values.flatMap((value) => value.split(/\s+/)).filter((url) => url !== '');
}

/** The first segment of every standard component location but the manifest's: what a plugin has at its top level. */
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
  { signal }: { readonly signal: AbortSignal },
): Promise<SessionArchives> {
  const loaded: { url: string; archive: FetchedArchive }[] = [];
  const errors: { url: string; issue: PluginIssue }[] = [];
  for (const url of pluginUrls(urls)) {
    const fetched = await fetchArchive(
      { kind: 'archive', url, limits: ARCHIVE_LIMITS, headers: {}, rootDepth: 'top-or-one-down' },
      ports,
      { signal },
    );
    if ('severity' in fetched) errors.push({ url, issue: fetched });
    else loaded.push({ url, archive: fetched });
  }
  return { loaded, errors };
}
