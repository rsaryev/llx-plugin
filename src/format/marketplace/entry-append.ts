import { warning, type PluginIssue } from '../issues.ts';
import type { PluginManifest } from '../manifest-schema.ts';

/**
 * How one component field of an entry joins the same field of plugin.json under strict mode
 * (plugins/manifest-reference.md, "How entry fields combine with `plugin.json`"): paths are
 * appended, a `commands` map adds its commands, and for `hooks` the entry's matchers replace the
 * manifest's per event.
 */

type Paths = string | string[];
type Commands = PluginManifest['commands'];
type Hooks = PluginManifest['hooks'];

const listOf = (value: Paths): string[] => (typeof value === 'string' ? [value] : value);

/** The manifest's paths followed by the entry's; when only one holds the field it stays as written. */
export function appendPaths(
  manifest: Paths | undefined,
  entry: Paths | undefined,
): Paths | undefined {
  if (manifest === undefined || entry === undefined) return manifest ?? entry;
  return [...listOf(manifest), ...listOf(entry)];
}

const isPaths = (value: Commands): value is Paths =>
  typeof value === 'string' || Array.isArray(value);

const MIXED_COMMANDS =
  "The entry's \"commands\" are a map and plugin.json's are paths, or the other way round; they cannot be combined, so plugin.json's apply";

/**
 * `commands` takes paths or a map of command name to source or content. Two lists append; two maps
 * merge, the entry's command replacing a manifest command of the same name (spec/judgments.md); a
 * list and a map cannot be held in one field, so the manifest's stays and the entry's is reported.
 */
export function combineCommands(
  manifest: Commands | undefined,
  entry: Commands | undefined,
): { value: Commands | undefined; issues: PluginIssue[] } {
  if (manifest === undefined || entry === undefined)
    return { value: manifest ?? entry, issues: [] };
  if (isPaths(manifest) && isPaths(entry))
    return { value: appendPaths(manifest, entry), issues: [] };
  if (!isPaths(manifest) && !isPaths(entry))
    return { value: { ...manifest, ...entry }, issues: [] };
  return { value: manifest, issues: [warning('commands', MIXED_COMMANDS)] };
}

type HookFile = string | Readonly<Record<string, unknown>>;
const isInline = (item: HookFile): item is Readonly<Record<string, unknown>> =>
  typeof item !== 'string';

/** The inline hooks without the events `replaced` names. */
const without = (
  inline: Readonly<Record<string, unknown>>,
  replaced: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(inline).filter(([event]) => !Object.hasOwn(replaced, event)));

/**
 * The hooks of a plugin once the entry's are laid over them: for an event both declare, the
 * entry's matchers replace the manifest's; an event only one declares keeps its own. Hook files the
 * manifest names cannot be read here, so they stay and the entry's object follows them (the caller
 * reports which events it replaces).
 */
export function mergeHooks(
  manifest: Hooks | undefined,
  entry: Readonly<Record<string, unknown>>,
): Hooks {
  if (manifest === undefined) return entry;
  if (typeof manifest === 'string') return [manifest, entry];
  if (Array.isArray(manifest)) {
    return [...manifest.map((item) => (isInline(item) ? without(item, entry) : item)), entry];
  }
  return { ...without(manifest, entry), ...entry };
}
