import type { PluginIssue } from '../../src/format/issues.ts';
import type { EntrySlot } from '../../src/format/marketplace/marketplace.ts';
import { readMarketplace, validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import {
  createEntryReader,
  readEntry,
  type SourceParser,
} from '../../src/format/marketplace/entries.ts';
import type { MarketplaceContext, MarketplaceEntry } from '../../src/format/marketplace/types.ts';
import { withFields } from './marketplace-fixtures.ts';

/**
 * Stand-in for the plugin source parser (a later piece of the stream), so the entry reader is
 * tested on its own: a `./` string is a relative source, an object names its kind in `source`,
 * anything else is the documented `Invalid input`.
 */
export const stubSourceParser: SourceParser = (raw, slot) => {
  const path = `plugins[${slot.index}].source`;
  if (typeof raw === 'string' && raw.startsWith('./')) {
    return { source: { kind: 'relative', path: raw.slice(2), bare: false }, issues: [] };
  }
  if (raw === '.') return { source: { kind: 'relative', path: '.', bare: false }, issues: [] };
  if (typeof raw === 'object' && raw !== null && 'source' in raw) {
    if (raw.source === 'archive' && 'url' in raw && typeof raw.url === 'string') {
      const sha256 =
        'sha256' in raw && typeof raw.sha256 === 'string' ? { sha256: raw.sha256 } : {};
      return { source: { kind: 'archive', url: raw.url, ...sha256 }, issues: [] };
    }
    if (raw.source === 'github' && 'repo' in raw && typeof raw.repo === 'string') {
      return { source: { kind: 'github', repo: raw.repo }, issues: [] };
    }
  }
  return { source: undefined, issues: [{ severity: 'error', path, message: 'Invalid input' }] };
};

export const slotAt = (index = 0, rest: Partial<EntrySlot> = {}): EntrySlot => ({
  index,
  context: {},
  ...rest,
});

/** The smallest valid entry, with `changes` laid over it (`undefined` removes a key). */
export function rawEntry(changes: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    name: 'my-plugin',
    source: './plugins/my-plugin',
    ...changes,
  };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete merged[key];
  }
  return merged;
}

export const readOne = (
  raw: unknown,
  slot: EntrySlot = slotAt(),
  parser: SourceParser = stubSourceParser,
) => readEntry(raw, slot, parser);

/** The entry that loaded; fails the test (by throwing) when none did. */
export function loaded(raw: unknown, slot: EntrySlot = slotAt()): MarketplaceEntry {
  const { entry, issues } = readOne(raw, slot);
  if (entry === undefined) throw new Error(`entry did not load: ${JSON.stringify(issues)}`);
  return entry;
}

const reader = createEntryReader(stubSourceParser);

/** A marketplace holding `plugins`, read with the real entry reader. */
export const readPlugins = (plugins: readonly unknown[], context: MarketplaceContext = {}) =>
  readMarketplace(withFields({ plugins }), context, reader);

/** What `claude plugin validate` reports for a marketplace holding `plugins`. */
export const validatePlugins = (
  plugins: readonly unknown[],
  context: MarketplaceContext = {},
): PluginIssue[] => validateMarketplace(withFields({ plugins }), context, reader);
