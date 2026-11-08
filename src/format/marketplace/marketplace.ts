import { blocksLoading, error, warning, type PluginIssue } from '../issues.ts';
import { withoutDuplicates, type IndexedEntry } from './entry-checks.ts';
import { pluginIdIssues, desktopNameIssues } from './ids.ts';
import { marketplaceNameIssues, validationNameIssues } from './marketplace-names.ts';
import { isRecord, readTopLevel, typeName, type TopLevel } from './marketplace-schema.ts';
import { validateRenames } from './renames.ts';
import type {
  Marketplace,
  MarketplaceContext,
  MarketplaceEntry,
  MarketplaceResult,
  ReadMode,
} from './types.ts';

/**
 * Reading `marketplace.json` as Claude Code loads it (plugins/marketplace-reference.md, "Top-level
 * fields" and "Validation messages"; plugins/create-marketplace.md, "Problems that validation
 * reports"): the top-level fields and the marketplace's name are checked here; each entry is handed
 * to an `EntryReader` on its own, because "each entry is validated on its own, so one invalid
 * entry doesn't fail the marketplace".
 */

/** What reading one entry gave: the entry when it loads, and what was found either way. */
export interface EntryReading {
  readonly entry: MarketplaceEntry | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Where an entry stands in its marketplace. */
export interface EntrySlot {
  readonly index: number;
  /** `metadata.pluginRoot`: the directory bare relative sources resolve under. */
  readonly pluginRoot?: string;
  readonly context: MarketplaceContext;
  /** `load` unless the marketplace is being validated. */
  readonly mode?: ReadMode;
}

/** Reads one raw `plugins[i]` into an entry; never throws, an entry that cannot load is `undefined`. */
export type EntryReader = (raw: unknown, slot: EntrySlot) => EntryReading;

/**
 * The reader used until the entry reader of the marketplace stream is installed: it drops every
 * entry and says so, so no entry is ever reported as valid without having been read.
 */
export const unreadEntry: EntryReader = (_raw, slot) => ({
  entry: undefined,
  issues: [error(`plugins[${slot.index}]`, 'Plugin entries are not read yet')],
});

const NO_DESCRIPTION =
  'No marketplace description provided. Adding a description helps users understand what this marketplace offers';

/** The name's reports: the grammar, Claude Desktop, and the reserved names (`validate` leaves out what only adding or loading refuses). */
function nameIssues(name: string, mode: ReadMode, context: MarketplaceContext): PluginIssue[] {
  return [
    ...pluginIdIssues('marketplace', name, 'name'),
    ...desktopNameIssues('marketplace', name, 'name'),
    ...(mode === 'load'
      ? marketplaceNameIssues(name, {
          ...(context.origin === undefined ? {} : { origin: context.origin }),
          ...(context.hostedOnClaudeAi === undefined
            ? {}
            : { hostedOnClaudeAi: context.hostedOnClaudeAi }),
        })
      : validationNameIssues(name)),
  ];
}

/** The warnings of a marketplace that otherwise loads: no description anywhere, no plugins. */
function completenessIssues(top: TopLevel): PluginIssue[] {
  const found: PluginIssue[] = [];
  if (top.description === undefined && top.metadata?.description === undefined) {
    found.push(warning('description', NO_DESCRIPTION));
  }
  if (top.plugins.length === 0)
    found.push(warning('plugins', 'Marketplace has no plugins defined'));
  return found;
}

/** What only `claude plugin validate` reports of the top level: the `renames` chains, against the names in `plugins[]`. */
function renameIssues(top: TopLevel, mode: ReadMode): PluginIssue[] {
  if (mode !== 'validate') return [];
  const names = top.plugins.flatMap((raw) =>
    isRecord(raw) && typeof raw.name === 'string' ? [raw.name] : [],
  );
  return validateRenames(top.renames, names);
}

function readEntries(
  top: TopLevel,
  context: MarketplaceContext,
  readEntry: EntryReader,
  mode: ReadMode,
): { entries: MarketplaceEntry[]; issues: PluginIssue[] } {
  const read: IndexedEntry[] = [];
  const issues: PluginIssue[] = [];
  const pluginRoot = top.metadata?.pluginRoot;
  top.plugins.forEach((raw, index) => {
    const slot = { index, context, mode, ...(pluginRoot === undefined ? {} : { pluginRoot }) };
    const reading = readEntry(raw, slot);
    issues.push(...reading.issues);
    if (reading.entry !== undefined) read.push({ index, entry: reading.entry });
  });
  const unique = withoutDuplicates(read);
  return { entries: unique.entries, issues: [...issues, ...unique.issues] };
}

function assemble(
  raw: unknown,
  context: MarketplaceContext,
  readEntry: EntryReader,
  mode: ReadMode,
): MarketplaceResult {
  if (!isRecord(raw)) {
    return {
      marketplace: undefined,
      issues: [
        error('marketplace.json', `Invalid input: expected object, received ${typeName(raw)}`),
      ],
    };
  }
  const { top, issues: topIssues } = readTopLevel(raw);
  const named = typeof raw.name === 'string' ? nameIssues(raw.name, mode, context) : [];
  if (top === undefined) return { marketplace: undefined, issues: [...topIssues, ...named] };
  const { entries, issues: entryIssues } = readEntries(top, context, readEntry, mode);
  const issues = [
    ...topIssues,
    ...named,
    ...completenessIssues(top),
    ...entryIssues,
    ...renameIssues(top, mode),
  ];
  if (blocksLoading([...topIssues, ...named])) return { marketplace: undefined, issues };
  const marketplace: Marketplace = {
    name: top.name,
    owner: top.owner,
    plugins: entries,
    ...(top.description === undefined ? {} : { description: top.description }),
    ...(top.version === undefined ? {} : { version: top.version }),
    ...(top.metadata === undefined ? {} : { metadata: top.metadata }),
    forceRemoveDeletedPlugins: top.forceRemoveDeletedPlugins,
    allowCrossMarketplaceDependenciesOn: top.allowCrossMarketplaceDependenciesOn,
    renames: top.renames,
  };
  return { marketplace, issues };
}

/**
 * The parsed `marketplace.json` as Claude Code loads it: an error in a top-level field or in the
 * name keeps the marketplace from loading; an entry with an error is dropped alone.
 */
export function readMarketplace(
  raw: unknown,
  context: MarketplaceContext = {},
  readEntry: EntryReader = unreadEntry,
): MarketplaceResult {
  return assemble(raw, context, readEntry, 'load');
}

/** What `claude plugin validate` reports about a `marketplace.json`. */
export function validateMarketplace(
  raw: unknown,
  context: MarketplaceContext = {},
  readEntry: EntryReader = unreadEntry,
): PluginIssue[] {
  return [...assemble(raw, context, readEntry, 'validate').issues];
}

/** `description`, or `metadata.description` when the top level has none ("Alternate location"). */
export const effectiveDescription = (marketplace: Marketplace): string | undefined =>
  marketplace.description ?? marketplace.metadata?.description;

/** `version`, or `metadata.version` when the top level has none. */
export const effectiveVersion = (marketplace: Marketplace): string | undefined =>
  marketplace.version ?? marketplace.metadata?.version;
