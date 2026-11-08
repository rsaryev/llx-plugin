import type { PluginIssue } from '../format/issues.ts';
import type { PluginManifest, CommandEntry } from '../format/manifest-schema.ts';
import type { PluginFiles } from '../ports/index.ts';

/**
 * What discovery finds: paths and names only, no file is parsed (the readers do that), so what the
 * layout puts where can be proven apart from what a skill, agent or hook file contains.
 */
export interface DiscoveredFile {
  /** Relative to the plugin root; `undefined` for a command whose `content` is inline in the manifest. */
  readonly path: string | undefined;
  /**
   * The name inside the plugin: a skill's directory, a command or agent file with its folders joined
   * by `:` (`db:migrate`), an output style, workflow or theme file without its extension.
   */
  readonly name: string;
  /** A skill's folder, which also holds its supporting files. */
  readonly directory?: string;
  /** A command declared in the manifest's object map. */
  readonly entry?: CommandEntry;
}

/** A hooks, LSP or monitors source: a file to read or a value written in the manifest. */
export type ConfigInput =
  | { readonly file: string; readonly written: string }
  | { readonly inline: unknown };

export interface Discovered {
  readonly skills: readonly DiscoveredFile[];
  readonly commands: readonly DiscoveredFile[];
  readonly agents: readonly DiscoveredFile[];
  readonly outputStyles: readonly DiscoveredFile[];
  readonly workflows: readonly DiscoveredFile[];
  readonly themes: readonly DiscoveredFile[];
  /** In loading order: the default file first, then what the manifest declares. */
  readonly hooks: readonly ConfigInput[];
  readonly lspServers: readonly ConfigInput[];
  readonly monitors: readonly ConfigInput[];
  /** The `settings.json` at the plugin root, when there is one. */
  readonly settingsFile: string | undefined;
  /** Whether `bin/` exists, and the files directly in it. */
  readonly bin: { readonly present: boolean; readonly files: readonly string[] };
  readonly issues: readonly PluginIssue[];
}

/** What every discovery step needs. */
export interface DiscoverContext {
  readonly files: PluginFiles;
  readonly manifest: PluginManifest | undefined;
  /** The name components are namespaced under; also names a skill at the plugin root. */
  readonly pluginName: string;
  readonly signal?: AbortSignal;
}

/** One step's result: what it found and what it reported. */
export interface Found<T> {
  readonly found: readonly T[];
  readonly issues: readonly PluginIssue[];
}
