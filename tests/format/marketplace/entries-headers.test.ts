/**
 * marketplace-reference.md § Validation messages (the two header rows and the sha256 pin row);
 * host-marketplace.md § When Claude Code skips a headersHelper command or drops its output
 * ("Entry sets a routing or identity header": Host, Cookie and X-Forwarded-* are dropped,
 * authentication names such as Authorization are kept).
 */
import { describe, expect, test } from 'bun:test';
import { isRoutingHeader } from '../../../src/format/marketplace/header-names.ts';
import { rawEntry, readOne } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const archive = { source: 'archive', url: 'https://registry.example.com/p.zip' };
const pinned = { ...archive, sha256: 'a'.repeat(64) };

spec(['marketplace.entry.headers', 'marketplace.entry.headersHelper'], () => {
  test('a routing or identity header on an entry is the quoted warning, and the entry still loads', () => {
    const { entry, issues } = readOne(
      rawEntry({ source: archive, headers: { Host: 'evil.example', 'X-Team': 'infra' } }),
    );
    expect(entry).toBeDefined();
    expect(issues).toContainEqual({
      severity: 'warning',
      path: 'plugins[0].headers.Host',
      message:
        'Header "Host" is a request-routing/identity header that catalog entries may not set; Claude Code drops it at download time.',
    });
    expect(issues.filter((found) => found.path.startsWith('plugins[0].headers.'))).toHaveLength(1);
  });

  test('Cookie and every X-Forwarded-* name warn, whatever the casing; Authorization does not', () => {
    const headers = {
      cookie: 'a=b',
      'X-Forwarded-For': '1.2.3.4',
      'x-forwarded-host': 'h',
      Authorization: 'Bearer t',
    };
    const { issues } = readOne(rawEntry({ source: archive, headers }));
    const warned = issues
      .filter((found) => found.path.startsWith('plugins[0].headers.'))
      .map((found) => found.path)
      .toSorted();
    expect(warned).toEqual([
      'plugins[0].headers.X-Forwarded-For',
      'plugins[0].headers.cookie',
      'plugins[0].headers.x-forwarded-host',
    ]);
  });

  test('an archive entry with a headersHelper and no sha256 pin gets the quoted warning at source.sha256', () => {
    const { entry, issues } = readOne(
      rawEntry({ source: archive, headersHelper: './h.sh', strict: false }),
    );
    expect(entry).toBeDefined();
    expect(issues).toContainEqual({
      severity: 'warning',
      path: 'plugins[0].source.sha256',
      message: 'Plugin "my-plugin" fetches its archive with a headersHelper but sets no sha256 pin',
    });
  });

  test('a pin silences it, and so does an entry without a helper', () => {
    const pinnedRead = readOne(
      rawEntry({ source: pinned, headersHelper: './h.sh', strict: false }),
    );
    const plain = readOne(rawEntry({ source: archive, headers: { 'X-Team': 'infra' } }));
    for (const { issues } of [pinnedRead, plain]) {
      expect(issues.filter((found) => found.path === 'plugins[0].source.sha256')).toEqual([]);
    }
  });
});

describe('the routing and identity header names (judgment: only the names the docs give)', () => {
  test('Host, Cookie and X-Forwarded-* in any casing; nothing else', () => {
    for (const name of ['Host', 'HOST', 'cookie', 'Cookie', 'X-Forwarded-For', 'x-forwarded-']) {
      expect(isRoutingHeader(name)).toBe(true);
    }
    for (const name of ['Authorization', 'X-Api-Key', 'X-Team', 'Hostname', 'Cookies']) {
      expect(isRoutingHeader(name)).toBe(false);
    }
  });
});
