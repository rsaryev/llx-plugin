/**
 * marketplace-reference.md: an unknown `metadata` key warns "Unknown field '<key>'. Claude Code
 * ignores it at load time." Judgment (spec/judgments.md, `MarketplaceMetadata.extra`): ignoring it is
 * Claude Code's; the kit still warns and hands the keys to the host as `metadata.extra`, the way
 * `InstallRecord.extra` keeps what it does not read, so a host that shows them need not parse twice.
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../../src/format/marketplace/marketplace.ts';
import { recordingEntryReader, withFields } from '../../support/marketplace-fixtures.ts';

const read = (metadata: unknown) =>
  readMarketplace(withFields({ metadata, plugins: [] }), {}, recordingEntryReader().read);

describe('metadata keeps the keys it does not read (judgment)', () => {
  test('an unknown key is kept under extra and still warned about', () => {
    const result = read({ version: '1.0.0', homepage: 'https://x.dev', tags: ['a'] });
    expect(result.marketplace?.metadata).toEqual({
      version: '1.0.0',
      extra: { homepage: 'https://x.dev', tags: ['a'] },
    });
    expect(
      result.issues.map((issue) => issue.path).filter((path) => path.startsWith('metadata')),
    ).toEqual(['metadata.homepage', 'metadata.tags']);
  });

  test('metadata with only known keys has no extra', () => {
    expect(read({ pluginRoot: './plugins' }).marketplace?.metadata).toEqual({
      pluginRoot: './plugins',
    });
  });
});
