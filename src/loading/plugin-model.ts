import type { PluginIssue } from '../format/issues.ts';
import type { PluginSettings } from '../format/plugin-settings.ts';
import type { LspServer } from '../format/lsp-config.ts';
import type { PluginManifest, CommandEntry, UserConfigOption } from '../format/manifest-schema.ts';
import type { PluginMcpServer } from '../format/mcp-config.ts';
import type { Monitor } from '../format/monitors.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';

/**
 * A skill, command, agent or output style as loading finds it: its path, its name inside the plugin
 * and its text. Parsing it (frontmatter, body) belongs to the stream that owns the component; this
 * is the seam it plugs into (`COMPONENT_READERS`).
 */
export interface PluginTextFile {
  /** Relative to the plugin root; `undefined` for a command whose `content` is inline in the manifest. */
  readonly path: string | undefined;
  /** The name inside the plugin: `review`, `db:migrate`, `review:security`. */
  readonly name: string;
  /** `<plugin>:<name>`: the name a user and the model see. */
  readonly qualifiedName: string;
  /** The file's text, or the inline `content` of a manifest command. */
  readonly text: string;
  /** A skill's folder, which also holds its supporting files. */
  readonly directory?: string;
  /** The manifest's object-map entry of a command, which carries its description, model and tools. */
  readonly entry?: CommandEntry;
}

/** A workflow or theme file: its path is all loading needs of it. */
export interface PluginPath {
  readonly path: string;
  readonly name: string;
  readonly qualifiedName: string;
}

/** A plugin as loading found it (docs/API.md, "Loading"). */
export interface Plugin {
  readonly name: string;
  /** `undefined` when the plugin has no `.claude-plugin/plugin.json` (the manifest is optional). */
  readonly manifest: PluginManifest | undefined;
  readonly skills: readonly PluginTextFile[];
  readonly commands: readonly PluginTextFile[];
  readonly agents: readonly PluginTextFile[];
  readonly hooks: HooksSettings;
  readonly mcpServers: Readonly<Record<string, PluginMcpServer>>;
  readonly lspServers: Readonly<Record<string, LspServer>>;
  readonly monitors: readonly Monitor[];
  readonly outputStyles: readonly PluginTextFile[];
  readonly workflows: readonly PluginPath[];
  readonly themes: readonly PluginPath[];
  readonly settings: PluginSettings;
  readonly userConfig: Readonly<Record<string, UserConfigOption>>;
  /** The files directly in `bin/`, relative to the plugin root. */
  readonly bin: readonly string[];
  /** Whether the plugin has a `bin/` directory, empty or not. */
  readonly hasBin: boolean;
}

/** The result of `loadPlugin`: a plugin that loads, and everything found wrong or worth a warning. */
export interface LoadedPlugin {
  /** `undefined` when the plugin does not load: a manifest that fails, or no name to load it under. */
  readonly plugin: Plugin | undefined;
  readonly issues: readonly PluginIssue[];
}
