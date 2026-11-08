import { error, type PluginIssue } from '../format/issues.ts';
import { declaredKey } from '../format/layout.ts';
import { readLspConfig, mergeLspSources, type LspConfigRead } from '../format/lsp-config.ts';
import { collectMcpServers } from '../format/mcp-sources.ts';
import { readMonitors, type MonitorsRead } from '../format/monitors.ts';
import { readHooksFile, readHooksSettings, type HooksRead } from '../format/hooks-settings.ts';
import {
  hasAppliedSettings,
  readPluginSettings,
  type PluginSettingsRead,
} from '../format/plugin-settings.ts';
import type { ConfigInput } from './discovered.ts';
import { mergeHooks } from './merge-hooks.ts';
import { readJson } from './read-json.ts';
import type { ComponentRead, ComponentValues, ReaderContext } from './reader-types.ts';

const failed = (path: string, message: string): PluginIssue[] => [error(path, message)];

/** Reads one source with the reader of its kind: a file is parsed first, an inline value is used as is. */
async function readInput<R extends { readonly issues: readonly PluginIssue[] }>(
  context: ReaderContext,
  input: ConfigInput,
  reader: {
    readonly file: (raw: unknown, path: string) => R;
    readonly inline: (value: unknown) => R;
    readonly empty: R;
    readonly failure: (path: string, reason: string) => string;
  },
): Promise<R> {
  if ('inline' in input) return reader.inline(input.inline);
  const parsed = await readJson(context.files, input.file, context.signal);
  if ('problem' in parsed) {
    return {
      ...reader.empty,
      issues: failed(input.file, reader.failure(input.file, parsed.problem)),
    };
  }
  return reader.file(parsed.value, input.file);
}

const noHooks: HooksRead = { hooks: {}, issues: [] };

/** A hooks file that fails "does not load": its errors are reported as `Failed to load hooks from <path>: <reason>`. */
const hooksFile = (raw: unknown, path: string): HooksRead => {
  const read = readHooksFile(raw);
  return {
    hooks: read.hooks,
    issues: read.issues.map((found) =>
      found.severity === 'error'
        ? error(path, `Failed to load hooks from ${path}: ${found.message}`)
        : found,
    ),
  };
};

export async function readHooks(
  context: ReaderContext,
): Promise<ComponentRead<ComponentValues['hooks']>> {
  const reads = await Promise.all(
    context.discovered.hooks.map((input) =>
      readInput(context, input, {
        file: hooksFile,
        inline: readHooksSettings,
        empty: noHooks,
        failure: (path, reason) => `Failed to load hooks from ${path}: ${reason}`,
      }),
    ),
  );
  return {
    value: mergeHooks(reads.map((read) => read.hooks)),
    issues: reads.flatMap((read) => [...read.issues]),
  };
}

const noLsp: LspConfigRead = { servers: {}, issues: [] };

export async function readLspServers(
  context: ReaderContext,
): Promise<ComponentRead<ComponentValues['lspServers']>> {
  const reads = await Promise.all(
    context.discovered.lspServers.map((input) =>
      readInput(context, input, {
        file: (raw, path) => readLspConfig(raw, path),
        inline: (value) => readLspConfig(value, 'lspServers'),
        empty: noLsp,
        failure: (path, reason) => `Invalid LSP server config for "${path}": ${reason}`,
      }),
    ),
  );
  const merged = mergeLspSources(reads);
  return { value: merged.servers, issues: merged.issues };
}

const noMonitors: MonitorsRead = { monitors: [], issues: [] };

export async function readMonitorList(
  context: ReaderContext,
): Promise<ComponentRead<ComponentValues['monitors']>> {
  const origin = declaredKey(context.manifest, 'monitors')?.key ?? 'monitors';
  const reads = await Promise.all(
    context.discovered.monitors.map((input) =>
      readInput(context, input, {
        file: (raw, path) => readMonitors(raw, path),
        inline: (value) => readMonitors(value, origin),
        empty: noMonitors,
        failure: (path, reason) => `Invalid monitors in ${path}: ${reason}`,
      }),
    ),
  );
  return {
    value: reads.flatMap((read) => read.monitors),
    issues: reads.flatMap((read) => [...read.issues]),
  };
}

export async function readMcpServers(
  context: ReaderContext,
): Promise<ComponentRead<ComponentValues['mcpServers']>> {
  const collected = await collectMcpServers(
    context.files,
    context.manifest?.mcpServers,
    context.mcp,
  );
  return { value: collected.servers, issues: collected.issues };
}

/** `settings.json` as read, with the issue its parse failure raised. */
async function readSettingsFile(
  context: ReaderContext,
): Promise<{ readonly read: PluginSettingsRead | undefined; readonly issues: PluginIssue[] }> {
  const file = context.discovered.settingsFile;
  if (file === undefined) return { read: undefined, issues: [] };
  const parsed = await readJson(context.files, file, context.signal);
  if ('problem' in parsed) {
    return {
      read: undefined,
      issues: failed(file, `settings.json is not valid JSON: ${parsed.problem}`),
    };
  }
  return { read: readPluginSettings(parsed.value, file), issues: [] };
}

/**
 * `settings.json` over the manifest's `settings` key: "when both exist and `settings.json` sets at
 * least one supported key, `settings.json` applies and the manifest's `settings` is ignored"
 * (components.md, "Default settings").
 */
export async function readSettings(
  context: ReaderContext,
): Promise<ComponentRead<ComponentValues['settings']>> {
  const { read, issues } = await readSettingsFile(context);
  const fileWins = read !== undefined && hasAppliedSettings(read);
  const manifestRead = fileWins ? undefined : inlineSettings(context.manifest?.settings);
  const reads = [read, manifestRead].flatMap((one) => (one ? [one] : []));
  const chosen = fileWins ? read : (manifestRead ?? read);
  return {
    value: chosen?.settings ?? {},
    issues: [...issues, ...reads.flatMap((one) => [...one.issues])],
  };
}

const inlineSettings = (inline: unknown): PluginSettingsRead | undefined =>
  inline === undefined ? undefined : readPluginSettings(inline, 'settings');
