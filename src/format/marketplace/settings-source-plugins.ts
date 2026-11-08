import { blocksLoading, error, type PluginIssue } from '../issues.ts';
import { withoutDuplicates, type IndexedEntry } from './entry-checks.ts';
import { readEntry } from './entries.ts';
import { isRecord, typeName, unknownField } from './marketplace-schema.ts';
import { parsePluginSource } from './plugin-source.ts';
import type { MarketplaceEntry, PluginSourceKind } from './types.ts';

/**
 * The inline catalog of a `settings` marketplace source (plugins/marketplace-reference.md, "Fields
 * by type": "Each item takes `name`, `source`, `description`, `version`, `strict`, `headers`, and
 * `headersHelper`. Write each item's `source` as an object type, because a relative path has no
 * repository to resolve against"; settings-reference.md, `extraKnownMarketplaces`: "an entry in
 * settings doesn't need `"strict": false`, because a settings file carries no manifest fields to
 * inline"). Issue paths are `plugins[i]...`, relative to the source object.
 */

/** The seven keys an item takes; any other is unknown and ignored (spec/judgments.md). */
const SETTINGS_ENTRY_KEYS = [
  'name',
  'source',
  'description',
  'version',
  'strict',
  'headers',
  'headersHelper',
] as const;

const isItemKey = (key: string): boolean => SETTINGS_ENTRY_KEYS.some((known) => known === key);

const RELATIVE_REFUSAL =
  'A relative path cannot resolve: an entry declared in settings has no marketplace repository. Give it a github, url, git-subdir, npm, archive or command source';

/** Which plugin sources are paths inside a marketplace repository: the one kind settings cannot hold. */
const NEEDS_REPOSITORY: { readonly [K in PluginSourceKind]: boolean } = {
  relative: true,
  github: false,
  url: false,
  'git-subdir': false,
  npm: false,
  archive: false,
  command: false,
};

/**
 * Whether the item must be read as `strict: false`: the entry reader refuses `headersHelper`
 * without it, a rule of `marketplace.json` entries that does not apply in settings. The entry keeps
 * the `strict` the item declared.
 */
function needsRelaxedStrict(item: Readonly<Record<string, unknown>>): boolean {
  return item.headersHelper !== undefined && (item.strict === undefined || item.strict === true);
}

/** The catalog warning about routing headers names a rule of catalog entries; in settings it depends on the file (D-download-headers). */
const isCatalogHeaderNotice = (found: PluginIssue): boolean =>
  found.severity === 'warning' && /^plugins\[\d+\]\.headers\.[^.]+$/.test(found.path);

function readItem(item: Readonly<Record<string, unknown>>, index: number) {
  const known = Object.fromEntries(Object.entries(item).filter(([key]) => isItemKey(key)));
  const unknown = Object.keys(item)
    .filter((key) => !isItemKey(key))
    .map((key) => unknownField(key, `plugins[${index}].${key}`));
  const reading = readEntry(
    needsRelaxedStrict(item) ? { ...known, strict: false } : known,
    { index, context: {}, mode: 'load' },
    parsePluginSource,
  );
  const issues = [...unknown, ...reading.issues.filter((found) => !isCatalogHeaderNotice(found))];
  const entry = reading.entry;
  if (entry === undefined) return { entry: undefined, issues };
  if (NEEDS_REPOSITORY[entry.source.kind]) {
    return {
      entry: undefined,
      issues: [...issues, error(`plugins[${index}].source`, RELATIVE_REFUSAL)],
    };
  }
  const strict = typeof item.strict === 'boolean' ? item.strict : true;
  return { entry: { ...entry, strict }, issues };
}

/** The entries that load and what was found; an item that cannot load is dropped alone. */
export function readSettingsPlugins(items: readonly unknown[]): {
  readonly plugins: readonly MarketplaceEntry[];
  readonly issues: readonly PluginIssue[];
} {
  const kept: IndexedEntry[] = [];
  const issues: PluginIssue[] = [];
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(
        error(`plugins[${index}]`, `Invalid input: expected object, received ${typeName(item)}`),
      );
      return;
    }
    const reading = readItem(item, index);
    issues.push(...reading.issues);
    if (reading.entry !== undefined && !blocksLoading(reading.issues)) {
      kept.push({ index, entry: reading.entry });
    }
  });
  const unique = withoutDuplicates(kept);
  return { plugins: unique.entries, issues: [...issues, ...unique.issues] };
}
