import type { PluginIssue } from '../format/issues.ts';
import type { LspServer } from '../format/lsp-config.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';
import type { PluginMcpServer } from '../format/mcp-config.ts';
import type { CollectOptions } from '../format/mcp-sources.ts';
import type { Monitor } from '../format/monitors.ts';
import type { PluginSettings } from '../format/plugin-settings.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';
import type { PluginFiles } from '../ports/index.ts';
import type { Discovered } from './discovered.ts';
import type { PluginPath, PluginTextFile } from './plugin-model.ts';

/** What a component reader is given: the folder, the manifest and what discovery found. */
export interface ReaderContext {
  readonly files: PluginFiles;
  readonly manifest: PluginManifest | undefined;
  readonly pluginName: string;
  readonly discovered: Discovered;
  /** The host's MCP bundle capabilities. */
  readonly mcp: CollectOptions;
  readonly signal?: AbortSignal;
}

export interface ComponentRead<T> {
  readonly value: T;
  readonly issues: readonly PluginIssue[];
  /** Reading this component failed in a way that keeps the whole plugin from loading (oracle 2.1.319). */
  readonly rejectsPlugin?: boolean;
}

/** What each component kind loads into. */
export interface ComponentValues {
  readonly skills: readonly PluginTextFile[];
  readonly commands: readonly PluginTextFile[];
  readonly agents: readonly PluginTextFile[];
  readonly hooks: HooksSettings;
  readonly mcpServers: Readonly<Record<string, PluginMcpServer>>;
  readonly lspServers: Readonly<Record<string, LspServer>>;
  readonly outputStyles: readonly PluginTextFile[];
  readonly workflows: readonly PluginPath[];
  readonly themes: readonly PluginPath[];
  readonly monitors: readonly Monitor[];
  readonly bin: Discovered['bin'];
  readonly settings: PluginSettings;
}

export type ReadKind = keyof ComponentValues;

export type ComponentReader<K extends ReadKind> = (
  context: ReaderContext,
) => Promise<ComponentRead<ComponentValues[K]>>;
