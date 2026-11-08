import type { PluginManifest } from '../manifest-schema.ts';
import { defined } from './defined.ts';
import type { MarketplaceEntry, PluginSourceKind } from './types.ts';

/**
 * The display fields users see in plugin listings and details (plugins/marketplace-reference.md,
 * "Display fields"): `displayName`, `description`, `author`, `homepage`, `repository`, `license` and
 * `keywords`. "For a field you set on the entry, users see the entry's value, even when `plugin.json`
 * sets a different one. For a field the entry leaves unset, users see the `plugin.json` value."
 * Pure over a parsed entry and, when the host can read it, the plugin's `plugin.json`.
 */

export type DisplayFields = Readonly<
  Partial<
    Pick<
      PluginManifest,
      'displayName' | 'description' | 'author' | 'homepage' | 'repository' | 'license' | 'keywords'
    >
  >
>;

/** Before install: "Claude Code can read plugin.json only for entries with a relative-path source". */
const READABLE_BEFORE_INSTALL: { readonly [K in PluginSourceKind]: boolean } = {
  relative: true,
  github: false,
  url: false,
  'git-subdir': false,
  npm: false,
  archive: false,
  command: false,
};

const entryFields = (entry: MarketplaceEntry): DisplayFields =>
  defined({ displayName: entry.displayName, description: entry.description, ...entry.display });

const manifestFields = (manifest: PluginManifest): DisplayFields =>
  defined({
    displayName: manifest.displayName,
    description: manifest.description,
    author: manifest.author,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    keywords: manifest.keywords,
  });

/** Whether the listing is of a plugin not installed yet (`listed`) or one whose files are on disk (`installed`). */
export type ListingStage = 'listed' | 'installed';

/**
 * The display fields of one plugin as users see them at `stage`. `manifest` is the plugin's own
 * `plugin.json` (`undefined` when it has none or the host has not read it); before install it is
 * used only for a relative-path entry, whose files are inside the marketplace.
 */
export function listingFields(
  entry: MarketplaceEntry,
  manifest: PluginManifest | undefined,
  stage: ListingStage,
): DisplayFields {
  const readable = stage === 'installed' || READABLE_BEFORE_INSTALL[entry.source.kind];
  const fromManifest = readable && manifest !== undefined ? manifestFields(manifest) : {};
  return { ...fromManifest, ...entryFields(entry) };
}
