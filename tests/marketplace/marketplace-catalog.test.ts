/**
 * marketplace-reference.md, "Fields by type": a `directory` source's `path` is "the marketplace root,
 * the directory that contains `.claude-plugin/marketplace.json`". `readMarketplaceDirectory` reads that
 * file through `PluginFiles` rooted at the directory; `readMarketplaceText` reads a file's text (a
 * `url` download or a `file` source). Invalid JSON or a missing file is an issue, never a throw.
 */
import { describe, expect, test } from 'bun:test';
import {
  readMarketplaceDirectory,
  readMarketplaceText,
} from '../../src/marketplace/marketplace-catalog.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const BODY = JSON.stringify({
  name: 'team-tools',
  owner: { name: 'Team' },
  description: 'Tools',
  plugins: [{ name: 'fmt', source: './plugins/fmt' }],
});

spec('marketplace.rule.Marketplace sources.directory', () => {
  test('the directory holds .claude-plugin/marketplace.json', async () => {
    const files = memoryFiles({ '.claude-plugin/marketplace.json': BODY });
    const result = await readMarketplaceDirectory(files, {
      origin: { kind: 'directory', path: '/work/market' },
    });
    expect(result.marketplace?.name).toBe('team-tools');
    expect(result.marketplace?.plugins.map((entry) => entry.name)).toEqual(['fmt']);
    expect(files.reads).toEqual(['.claude-plugin/marketplace.json']);
  });
});

describe('reading a catalog (judgment)', () => {
  test('a directory without the file does not load', async () => {
    const result = await readMarketplaceDirectory(memoryFiles({}), {});
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toMatchObject([
      {
        severity: 'error',
        path: '.claude-plugin/marketplace.json',
        message: 'The marketplace file is missing',
      },
    ]);
  });

  test('text that is not JSON does not load', () => {
    const result = readMarketplaceText('{', {});
    expect(result.marketplace).toBeUndefined();
    expect(result.issues[0]?.message).toStartWith('Invalid JSON syntax: ');
  });

  test('a text read is readMarketplace over the parsed value', () => {
    expect(readMarketplaceText(BODY, {}).marketplace?.name).toBe('team-tools');
  });
});
