import { blocksLoading, error, warning, type PluginIssue } from '../issues.ts';
import { withoutDuplicates, type IndexedEntry } from './entry-checks.ts';
import { createEntryReader } from './entries.ts';
import { pluginIdIssues, desktopNameIssues } from './ids.ts';
import { marketplaceNameIssues, validationNameIssues } from './marketplace-names.ts';
import { isRecord, readTopLevel, typeName, type TopLevel } from './marketplace-schema.ts';
import { parsePluginSource } from './plugin-source.ts';
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
  /** The entry's fields pass the schema; absent is taken as true. */
  readonly schemaSound?: boolean;
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
 * The reader `readMarketplace` and `validateMarketplace` use unless given another (tests of the
 * top level pass a stand-in): each entry through the entry reader over the plugin source parser.
 */
const defaultEntryReader: EntryReader = createEntryReader(parsePluginSource);

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

/**
 * The warnings of a marketplace whose schema passes: no description anywhere, no plugins. A
 * marketplace the schema rejects gets neither (oracle 2.1.319).
 */
function completenessIssues(top: TopLevel): PluginIssue[] {
  const found: PluginIssue[] = [];
  if (top.plugins.length === 0)
    found.push(warning('plugins', 'Marketplace has no plugins defined'));
  if (top.description === undefined && top.metadata?.description === undefined) {
    found.push(warning('description', NO_DESCRIPTION));
  }
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

/** What reading the entries needs of the top level: they are read whether or not it is sound. */
interface EntryHost {
  readonly name: string | undefined;
  readonly plugins: readonly unknown[];
  readonly pluginRoot: string | undefined;
}

function readEntries(
  top: EntryHost,
  context: MarketplaceContext,
  readEntry: EntryReader,
  mode: ReadMode,
): { entries: MarketplaceEntry[]; issues: PluginIssue[]; schemaSound: boolean } {
  const read: IndexedEntry[] = [];
  const issues: PluginIssue[] = [];
  let schemaSound = true;
  const { pluginRoot } = top;
  top.plugins.forEach((raw, index) => {
    const slot = {
      index,
      context: { ...context, ...(top.name === undefined ? {} : { marketplaceName: top.name }) },
      mode,
      ...(pluginRoot === undefined ? {} : { pluginRoot }),
    };
    const reading = readEntry(raw, slot);
    issues.push(...reading.issues);
    if (reading.schemaSound === false) schemaSound = false;
    if (reading.entry !== undefined) read.push({ index, entry: reading.entry });
  });
  const unique = withoutDuplicates(read);
  return { entries: unique.entries, issues: [...issues, ...unique.issues], schemaSound };
}

function marketplaceOf(top: TopLevel, entries: MarketplaceEntry[]): Marketplace {
  return {
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
}

/** The entries are read whether or not the top level is sound: the schema reports every one beside its errors (oracle 2.1.319). */
function hostOf(raw: Readonly<Record<string, unknown>>): EntryHost {
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  return {
    name: typeof raw.name === 'string' ? raw.name : undefined,
    plugins: Array.isArray(raw.plugins) ? raw.plugins : [],
    pluginRoot: typeof metadata.pluginRoot === 'string' ? metadata.pluginRoot : undefined,
  };
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
  if (top === undefined) {
    const { issues: entryIssues } = readEntries(hostOf(raw), context, readEntry, mode);
    return { marketplace: undefined, issues: [...topIssues, ...named, ...entryIssues] };
  }
  const host = { name: top.name, plugins: top.plugins, pluginRoot: top.metadata?.pluginRoot };
  const { entries, issues: entryIssues, schemaSound } = readEntries(host, context, readEntry, mode);
  const sound = schemaSound && !blocksLoading([...topIssues, ...named]);
  const issues = [
    ...topIssues,
    ...named,
    ...(sound ? completenessIssues(top) : []),
    ...entryIssues,
    ...renameIssues(top, mode),
  ];
  if (blocksLoading([...topIssues, ...named])) return { marketplace: undefined, issues };
  const marketplace = marketplaceOf(top, entries);
  return { marketplace, issues };
}

/**
 * The parsed `marketplace.json` as Claude Code loads it: an error in a top-level field or in the
 * name keeps the marketplace from loading; an entry with an error is dropped alone.
 */
export function readMarketplace(
  raw: unknown,
  context: MarketplaceContext = {},
  readEntry: EntryReader = defaultEntryReader,
): MarketplaceResult {
  return assemble(raw, context, readEntry, 'load');
}

/** What `claude plugin validate` reports about a `marketplace.json`. */
export function validateMarketplace(
  raw: unknown,
  context: MarketplaceContext = {},
  readEntry: EntryReader = defaultEntryReader,
): PluginIssue[] {
  return [...assemble(raw, context, readEntry, 'validate').issues];
}

/** `description`, or `metadata.description` when the top level has none ("Alternate location"). */
export const effectiveDescription = (marketplace: Marketplace): string | undefined =>
  marketplace.description ?? marketplace.metadata?.description;

/** `version`, or `metadata.version` when the top level has none. */
export const effectiveVersion = (marketplace: Marketplace): string | undefined =>
  marketplace.version ?? marketplace.metadata?.version;
