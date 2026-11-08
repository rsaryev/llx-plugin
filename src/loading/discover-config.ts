import { error, type PluginIssue } from '../format/issues.ts';
import { STANDARD_LAYOUT, declaredKey } from '../format/layout.ts';
import { pathNotFound } from '../format/messages.ts';
import { COMBINE } from './combine.ts';
import type { ConfigInput, DiscoverContext, Discovered, Found } from './discovered.ts';
import { ignoredFolderIssues } from './ignored-folder.ts';
import { locate, rootRelative, childPath } from './locate.ts';

/** The kinds whose files are JSON configuration, read by their own reader. */
export const CONFIG_KINDS = ['hooks', 'lspServers', 'monitors'] as const;
export type ConfigKind = (typeof CONFIG_KINDS)[number];

/**
 * What a manifest value for a config key lists, one item per source: `hooks` and `lspServers` take
 * "a `.json` file path, an inline … object, or an array mixing both"; `experimental.monitors` takes
 * "a `.json` file path or the inline array", so an array there is one inline source.
 */
const ITEMS: { readonly [K in ConfigKind]: (value: unknown) => readonly unknown[] } = {
  hooks: (value) => (Array.isArray(value) ? value : [value]),
  lspServers: (value) => (Array.isArray(value) ? value : [value]),
  monitors: (value) => [value],
};

type Item = { readonly path: string; readonly written: string } | { readonly inline: unknown };

const itemOf = (value: unknown): Item =>
  typeof value === 'string' ? { path: rootRelative(value), written: value } : { inline: value };

async function resolveItem(
  kind: ConfigKind,
  item: Item,
  declared: boolean,
  context: DiscoverContext,
): Promise<Found<ConfigInput>> {
  if ('inline' in item) return { found: [{ inline: item.inline }], issues: [] };
  const located = await locate(context.files, kind, item.written, context.signal);
  if (located.issue) return { found: [], issues: [located.issue] };
  if (!located.stat) {
    const missing: PluginIssue[] = declared ? [error(kind, pathNotFound(kind, item.written))] : [];
    return { found: [], issues: missing };
  }
  return { found: [{ file: item.path, written: item.written }], issues: [] };
}

/**
 * The sources of hooks, LSP servers or monitors in loading order: the default file and what the
 * manifest declares, combined by the kind's rule (`hooks` and `lspServers` merge, the default
 * first; `monitors` is replaced by `experimental.monitors`, the top-level `monitors` alias used
 * only when it is absent: judgment). A default file that is not there is skipped.
 */
export async function discoverConfig(
  kind: ConfigKind,
  context: DiscoverContext,
): Promise<Found<ConfigInput>> {
  const entry = STANDARD_LAYOUT[kind];
  const declared = declaredKey(context.manifest, kind);
  const items = declared === undefined ? undefined : ITEMS[kind](declared.value).map(itemOf);
  const warnings = await ignoredFolderIssues(
    kind,
    (items ?? []).flatMap((item) => ('written' in item ? [item.written] : [])),
    context,
  );
  const defaults: readonly Item[] = [{ path: entry.location, written: entry.location }];
  const order = COMBINE[entry.combine ?? 'replace'](defaults, items);
  const resolved = await Promise.all(
    order.map((item) => resolveItem(kind, item, items?.includes(item) === true, context)),
  );
  return {
    found: resolved.flatMap((one) => one.found),
    issues: [...warnings, ...resolved.flatMap((one) => one.issues)],
  };
}

/** The `settings.json` at the plugin root, when it is there and inside the plugin. */
export async function discoverSettings(context: DiscoverContext): Promise<Found<string>> {
  const { location } = STANDARD_LAYOUT.settings;
  const located = await locate(context.files, 'settings', location, context.signal);
  if (located.issue) return { found: [], issues: [located.issue] };
  return { found: located.stat?.isFile ? [location] : [], issues: [] };
}

/** `bin/`: whether it exists (a plugin "that has this directory") and the files directly in it. */
export async function discoverBin(context: DiscoverContext): Promise<Discovered['bin']> {
  const { location } = STANDARD_LAYOUT.bin;
  const located = await locate(context.files, 'bin', location, context.signal);
  if (!located.stat?.isDirectory) return { present: false, files: [] };
  const entries = (await context.files.list(location, context.signal)) ?? [];
  return {
    present: true,
    files: entries.filter((one) => one.isFile).map((one) => childPath(location, one.name)),
  };
}
