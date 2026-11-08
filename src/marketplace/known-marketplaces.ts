import { error, type PluginIssue } from '../format/issues.ts';
import { parseMarketplaceSource } from '../format/marketplace/marketplace-source.ts';
import type { MarketplaceSource, MarketplaceSourceOf } from '../format/marketplace/types.ts';
import type { StoreLayout } from './store-layout.ts';

/**
 * `known_marketplaces.json`, "each marketplace Claude Code has fetched, with its `source`,
 * `installLocation`, `lastUpdated`, and `autoUpdate`", one per user (plugins/loading.md, "Check
 * which stage a plugin reached"); where a marketplace is on disk ("Find plugins on disk"); and the
 * two ways the registry fails to load (errors.md, "Failed to load marketplace configuration").
 *
 * The SDK types the `source` of an `extraKnownMarketplaces` entry, with `installLocation` and
 * `autoUpdate`; the file adds `lastUpdated`. The kit's `MarketplaceSource` names its member
 * `kind` (`directory`, `file`); the file writes that under `source`, as the settings key does. A
 * Localix `local` source is a `directory` or a `file` here, migrated once and never written.
 * Judgments (spec/judgments.md): the wording of the corrupted-file message after its quoted lead;
 * a registry with any entry that does not match is read as empty, since every command that needs it fails.
 */

export interface KnownMarketplace {
  readonly source: MarketplaceSource;
  /** `marketplaces/<name>/`, or for a local `file` or `directory` source the path you gave. */
  readonly installLocation: string;
  /** When Claude Code last fetched it, as the file writes it (ISO text). */
  readonly lastUpdated: string;
  /** Whether the marketplace and its installed plugins update on startup; absent means the default. */
  readonly autoUpdate?: boolean;
}

export type KnownMarketplaces = Readonly<Record<string, KnownMarketplace>>;

/** `unreadable`: "isn't valid JSON or can't be read" (an empty file too); `corrupted`: valid JSON that does not match the schema. */
export type RegistryFailureCode = 'unreadable' | 'corrupted';

export interface KnownMarketplacesRead {
  readonly marketplaces: KnownMarketplaces;
  readonly failure?: { readonly code: RegistryFailureCode; readonly message: string };
  readonly issues: readonly PluginIssue[];
}

const PATH = 'known_marketplaces.json';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readEntry(raw: unknown): KnownMarketplace | undefined {
  if (!isRecord(raw)) return undefined;
  const { installLocation, lastUpdated, autoUpdate } = raw;
  if (typeof installLocation !== 'string' || typeof lastUpdated !== 'string') return undefined;
  if (autoUpdate !== undefined && typeof autoUpdate !== 'boolean') return undefined;
  const { source } = parseMarketplaceSource(raw['source'], { policy: false });
  if (source === undefined) return undefined;
  return {
    source,
    installLocation,
    lastUpdated,
    ...(autoUpdate === undefined ? {} : { autoUpdate }),
  };
}

function failed(code: RegistryFailureCode, message: string): KnownMarketplacesRead {
  return { marketplaces: {}, failure: { code, message }, issues: [error(PATH, message)] };
}

const corruptedMessage = (names: readonly string[]): string =>
  `Marketplace configuration file is corrupted: ${names.map((name) => `"${name}"`).join(', ')} ${
    names.length === 1 ? 'does' : 'do'
  } not match the registry schema`;

/** The registry's text; no file is no marketplaces. */
export function parseKnownMarketplaces(text: string | undefined): KnownMarketplacesRead {
  if (text === undefined) return { marketplaces: {}, issues: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (thrown) {
    const detail = thrown instanceof Error ? thrown.message : String(thrown);
    return failed('unreadable', `Failed to load marketplace configuration: ${detail}`);
  }
  if (!isRecord(parsed)) return failed('corrupted', 'Marketplace configuration file is corrupted');
  const marketplaces: Record<string, KnownMarketplace> = {};
  const mismatched: string[] = [];
  for (const [name, raw] of Object.entries(parsed)) {
    const read = readEntry(raw);
    if (read === undefined) mismatched.push(name);
    else marketplaces[name] = read;
  }
  return mismatched.length === 0
    ? { marketplaces, issues: [] }
    : failed('corrupted', corruptedMessage(mismatched));
}

/** A source in the shape the file writes: its kind under `source`. */
function wire(source: MarketplaceSource): Record<string, unknown> {
  const { kind, ...fields } = source;
  return { source: kind, ...fields };
}

/** The registry's text, two-space indented with a final newline (a judgment, as for `installed_plugins.json`). */
export function serializeKnownMarketplaces(marketplaces: KnownMarketplaces): string {
  const written = Object.fromEntries(
    Object.entries(marketplaces).map(([name, known]) => [
      name,
      { ...known, source: wire(known.source) },
    ]),
  );
  return `${JSON.stringify(written, null, 2)}\n`;
}

/** The sources with no copy under the plugins root: the registry points at the path you gave. */
type LocalSource = MarketplaceSourceOf<'file'> | MarketplaceSourceOf<'directory'>;

const LOCAL_KINDS: ReadonlySet<string> = new Set(['file', 'directory']);
const isLocal = (source: MarketplaceSource): source is LocalSource => LOCAL_KINDS.has(source.kind);

/**
 * Where the registry says a marketplace is: `marketplaces/<name>/` for one added from GitHub,
 * another Git host or a URL; for a local `file` or `directory` source "no copy here", so the path
 * you gave (plugins/loading.md, "Find plugins on disk"). Judgment (spec/judgments.md): the other
 * kinds, which the docs do not place, are kept like a clone.
 */
export function installLocationFor(
  source: MarketplaceSource,
  name: string,
  layout: StoreLayout,
): string {
  return isLocal(source) ? source.path : layout.marketplace(name);
}

const sorted = (_key: string, value: unknown): unknown =>
  isRecord(value)
    ? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : value;

/**
 * "Two sources match when they have the same type and the same value in every field" (plugins/
 * troubleshooting.md, "already added from a different source"): an entry that sets a `ref` you
 * did not pass differs, and so does a `github` entry from the same repository as an https URL
 * (recorded as `git`). Field order does not matter; list order does.
 */
export const sameMarketplaceSource = (a: MarketplaceSource, b: MarketplaceSource): boolean =>
  JSON.stringify(a, sorted) === JSON.stringify(b, sorted);
