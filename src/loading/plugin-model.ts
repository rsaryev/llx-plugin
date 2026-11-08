import type { PluginIssue } from '../format/issues.ts';
import type { PluginSettings } from '../format/plugin-settings.ts';
import type { LspServer } from '../format/lsp-config.ts';
import type { PluginManifest, CommandEntry, UserConfigOption } from '../format/manifest-schema.ts';
import type { PluginMcpServer } from '../format/mcp-config.ts';
import type { Monitor } from '../format/monitors.ts';
import type { Theme } from '../format/theme.ts';
import type { WorkflowMeta } from '../format/workflow-meta.ts';
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

/**
 * A theme file of the plugin, read (plugins/components.md, "Themes and output styles"): it appears in
 * `/theme` under the file's `name` (`theme.name`, else the slug), marked as from the plugin: a theme has
 * no `<plugin>:` name, only output styles do. `theme` is `undefined` for a file that is not a JSON object.
 */
export interface PluginTheme {
  readonly path: string;
  /** The slug: the file name without `.json`. */
  readonly name: string;
  /** The plugin it comes from: `/theme` marks the theme as from it. */
  readonly plugin: string;
  readonly theme: Theme | undefined;
}

/**
 * A workflow script of the plugin, its `meta` block read without running it (workflows.md,
 * "Distribute a workflow in a plugin"). It runs as `/<plugin>:<meta.name>`: `qualifiedName` is
 * `undefined` when `meta` cannot be read, since Claude Code then drops it from `/` autocomplete.
 */
export interface PluginWorkflow {
  readonly path: string;
  /** The file name without `.js`. */
  readonly name: string;
  readonly qualifiedName: string | undefined;
  readonly meta: WorkflowMeta | undefined;
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
  readonly workflows: readonly PluginWorkflow[];
  readonly themes: readonly PluginTheme[];
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
  /** Debug-only load notices: never shown as validation findings in the Plugin Errors tab. */
  readonly debug?: readonly string[];
}
