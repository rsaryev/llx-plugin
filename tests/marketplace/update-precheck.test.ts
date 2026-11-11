/**
 * plugins/loading.md § Versions and updates: an update check computes "the version again" and makes
 * no copy when it matches the record; a plugin loaded in place loads its current files "whatever its
 * version string says"; for a marketplace hosted on claude.ai "the version claude.ai records for the
 * plugin is its version, and the manifest's `version` isn't read". Judgment (spec/judgments.md,
 * `precheckUpdate`): before fetching, only those two cases are settled; every other plugin's version
 * may come from the manifest or the source it fetches, so the answer is `fetch` and the host then
 * runs `checkForUpdate`. A version never decides alone that nothing changed.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { precheckUpdate } from '../../src/marketplace/update-detection.ts';

const GITHUB: PluginSource = { kind: 'github', repo: 'acme/tool' };
const RELATIVE: PluginSource = { kind: 'relative', path: 'plugins/tool', bare: false };
const LOCAL: MarketplaceSource = { kind: 'directory', path: '/m' };

describe('precheckUpdate (judgment)', () => {
  test('a plugin loaded in place is never compared', () => {
    expect(precheckUpdate({ source: RELATIVE, origin: LOCAL }, '1.0.0')).toBe('loaded in place');
  });

  test('a version claude.ai records is compared with the one kit comparison', () => {
    const subject = { source: GITHUB, origin: undefined, recordedByClaudeAi: '2.0.0' };
    expect(precheckUpdate(subject, '2.0.0')).toBe('unchanged');
    expect(precheckUpdate(subject, '1.0.0')).toBe('new copy');
    expect(precheckUpdate(subject, '3.0.0')).toBe('new copy');
    expect(precheckUpdate(subject, undefined)).toBe('new copy');
  });

  test('anything else is settled only after the fetch, an unknown version included', () => {
    expect(precheckUpdate({ source: GITHUB, origin: undefined }, '1.0.0')).toBe('fetch');
    expect(precheckUpdate({ source: GITHUB, origin: undefined }, 'unknown')).toBe('fetch');
    expect(
      precheckUpdate({ source: GITHUB, origin: undefined, recordedByClaudeAi: ' ' }, '1.0.0'),
    ).toBe('fetch');
  });
});
