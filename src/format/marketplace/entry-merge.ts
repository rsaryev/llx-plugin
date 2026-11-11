import { error, type PluginIssue } from '../issues.ts';
import type { PluginManifest } from '../manifest-schema.ts';
import { defined } from '../defined.ts';
import { appendPaths, combineCommands, mergeHooks } from './entry-append.ts';
import type { MarketplaceEntry, PluginSource, PluginSourceKind } from './types.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * How a plugin entry and the plugin's own `plugin.json` combine into the manifest Claude Code loads
 * (plugins/marketplace-reference.md, "How an entry combines with plugin.json", "Hooks in an entry",
 * "Display fields", "Strict mode"; plugins/manifest-reference.md, "How entry fields combine with
 * `plugin.json`", "Metadata precedence"). Pure over a parsed entry and a parsed `plugin.json`.
 */

/** What loading the plugin from this entry gives. */
export interface EntryMerge {
  /**
   * The manifest the plugin loads with, or `undefined` when the plugin fails to load (the strict
   * conflict). Its presence, not the issues' severity, says whether the plugin loads: the
   * `not yet supported in a marketplace entry` error leaves the plugin loading without those hooks.
   */
  readonly manifest: PluginManifest | undefined;
  /** The entry name: the install id and the `enabledPlugins` key. `manifest.name` is the namespace. */
  readonly installName: string;
  /**
   * Hook events the entry declares and the manifest also holds: "the entry's matchers for an event
   * replace the manifest's matchers for that same event". Hook files the manifest names (and
   * `hooks/hooks.json`) are not read here, so the loader drops their matchers for these events.
   */
  readonly replacedHookEvents: readonly string[];
  /** False when the plugin's default `skills/` directory is not scanned (root-source entry that lists skills). */
  readonly scanDefaultSkills: boolean;
  readonly issues: readonly PluginIssue[];
}

/** The six component fields the strict-mode table is about. */
const STRICT_FIELDS = ['commands', 'agents', 'skills', 'hooks', 'outputStyles', 'themes'] as const;

const declaresComponents = (entry: MarketplaceEntry): boolean =>
  STRICT_FIELDS.some((field) => entry.components[field] !== undefined);

/** `true` for the source that is the marketplace root itself (`"."`). */
const IS_ROOT: { readonly [K in PluginSourceKind]: (source: PluginSource) => boolean } = {
  relative: (source) => 'bare' in source && source.path === '.',
  github: () => false,
  url: () => false,
  'git-subdir': () => false,
  npm: () => false,
  archive: () => false,
  command: () => false,
};

const HOOKS_UNSUPPORTED =
  "Hooks written as a file path or an array are not yet supported in a marketplace entry; write them as an inline object, or put them in the plugin's hooks/hooks.json or plugin.json";

/** The entry's `hooks` when it is the supported inline object, and the report when it is not. */
function inlineHooks(entry: MarketplaceEntry): {
  hooks: Readonly<Record<string, unknown>> | undefined;
  issues: PluginIssue[];
} {
  const hooks = entry.components.hooks;
  if (hooks === undefined) return { hooks: undefined, issues: [] };
  if (isRecord(hooks)) return { hooks, issues: [] };
  return { hooks: undefined, issues: [error('hooks', HOOKS_UNSUPPORTED)] };
}

/** The entry's fields that outrank plugin.json whatever `strict` says: `defaultEnabled` and the display fields. */
const outranking = (entry: MarketplaceEntry) => ({
  ...defined({
    defaultEnabled: entry.defaultEnabled,
    displayName: entry.displayName,
    description: entry.description,
  }),
  ...entry.display,
});

/** A list of dependencies as the manifest holds it, or nothing for an empty one. */
const dependenciesOf = (
  ...lists: readonly (readonly NonNullable<PluginManifest['dependencies']>[number][] | undefined)[]
): NonNullable<PluginManifest['dependencies']> | undefined => {
  const all = lists.flatMap((list) => list ?? []);
  return all.length === 0 ? undefined : all;
};

/** The entry as a manifest: no plugin.json, so every field the entry accepts applies. */
function entryAsManifest(
  entry: MarketplaceEntry,
  hooks: Readonly<Record<string, unknown>> | undefined,
) {
  return {
    name: entry.name,
    ...defined({ version: entry.version, dependencies: dependenciesOf(entry.dependencies) }),
    ...outranking(entry),
    ...defined({ ...entry.components, hooks }),
  };
}

/** plugin.json is the manifest; the entry completes it (strict) and outranks it for the display fields. */
function completeManifest(
  entry: MarketplaceEntry,
  manifest: PluginManifest,
  hooks: Readonly<Record<string, unknown>> | undefined,
): { manifest: PluginManifest; issues: PluginIssue[] } {
  const { commands, agents, skills, outputStyles, themes } = entry.components;
  const dependencies = dependenciesOf(manifest.dependencies, entry.dependencies);
  const issues: PluginIssue[] = [];
  if (entry.strict) {
    const commandsMerge = combineCommands(manifest.commands, commands);
    issues.push(...commandsMerge.issues);
    return {
      manifest: {
        ...manifest,
        ...outranking(entry),
        ...defined({
          version: manifest.version ?? entry.version,
          dependencies,
          commands: commandsMerge.value,
          agents: appendPaths(manifest.agents, agents),
          skills: appendPaths(manifest.skills, skills),
          outputStyles: appendPaths(manifest.outputStyles, outputStyles),
          themes: appendPaths(manifest.themes, themes),
          hooks: hooks === undefined ? manifest.hooks : mergeHooks(manifest.hooks, hooks),
        }),
      },
      issues,
    };
  }
  return {
    manifest: {
      ...manifest,
      ...outranking(entry),
      ...defined({
        version: manifest.version ?? entry.version,
        dependencies,
      }),
    },
    issues,
  };
}

/**
 * The manifest a plugin loads with, given its marketplace entry and its own `plugin.json`
 * (`undefined` when it has none).
 */
export function mergeEntryWithManifest(
  entry: MarketplaceEntry,
  manifest: PluginManifest | undefined,
): EntryMerge {
  const { hooks, issues: hookIssues } = inlineHooks(entry);
  const base = {
    installName: entry.name,
    scanDefaultSkills: !(
      entry.components.skills !== undefined && IS_ROOT[entry.source.kind](entry.source)
    ),
  };
  if (manifest === undefined) {
    return {
      ...base,
      manifest: entryAsManifest(entry, hooks),
      replacedHookEvents: [],
      issues: hookIssues,
    };
  }
  if (!entry.strict && declaresComponents(entry)) {
    return {
      ...base,
      manifest: undefined,
      replacedHookEvents: [],
      issues: [
        error(
          'plugin',
          `Plugin ${entry.name} has conflicting manifests: both plugin.json and marketplace entry specify components`,
        ),
      ],
    };
  }
  const merged = completeManifest(entry, manifest, hooks);
  return {
    ...base,
    manifest: merged.manifest,
    replacedHookEvents: entry.strict && hooks !== undefined ? Object.keys(hooks) : [],
    issues: [...hookIssues, ...merged.issues],
  };
}

/**
 * The name users see: the display name the merge settled on (the entry's, then plugin.json's), "when
 * neither ... sets one, users see the plugin's `name`" (marketplace-reference.md, `displayName`),
 * read as the name of the merged manifest (spec/judgments.md), the entry name when it fails to load.
 */
export const effectiveDisplayName = (merge: EntryMerge): string =>
  merge.manifest?.displayName ?? merge.manifest?.name ?? merge.installName;
