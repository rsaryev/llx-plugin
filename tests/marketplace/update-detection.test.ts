/**
 * plugins/loading.md § Versions and updates (and § How Claude Code computes the version): the
 * version is how an update is detected. `claude plugin update` and background auto-update "compute
 * the version again and don't replace the cached copy when it matches what `installed_plugins.json`
 * records"; a manifest that pins `version` "keeps every user on the cached copy until its author
 * changes the string, however many commits they push"; leaving `version` out lets users "track
 * commits instead". A plugin loaded in place "loads its current source files at every session
 * start, whatever its version string says" (§ In-place and copied plugins), and for a plugin from a
 * marketplace hosted on claude.ai "the version claude.ai records for the plugin is its version, and
 * the manifest's `version` isn't read". What the docs leave open (no record, a version that goes
 * backwards, a marketplace that is not a local path, which plugins load in place beyond the three
 * the docs list) is tested outside `spec(...)`. `upToDateMessage` is the wording of the unchanged case.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import {
  checkForUpdate,
  isUpdate,
  loadsInPlace,
  upToDateMessage,
} from '../../src/marketplace/update-detection.ts';
import { spec } from '../support/spec.ts';

const FIRST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SECOND = '0123456789abcdef0123456789abcdef01234567';

/** What a plugin hosted on GitHub computes after a push, for the given manifest and entry versions. */
const afterPush = (commit: string, manifestVersion?: string, entryVersion?: string): string =>
  computePluginVersion({
    ...(manifestVersion === undefined ? {} : { manifestVersion }),
    ...(entryVersion === undefined ? {} : { entryVersion }),
    source: { kind: 'github', commit },
  });

spec('updates.loading.How Claude Code computes the version', () => {
  describe('an update is a computed version that differs from the recorded one', () => {
    test('the same version leaves the cached copy: "<name> is already at the latest version (<version>)."', () => {
      expect(isUpdate('1.0.0', '1.0.0')).toBe('unchanged');
      expect(upToDateMessage('formatter', '1.0.0')).toBe(
        'formatter is already at the latest version (1.0.0).',
      );
    });

    test('a different version installs a new copy', () => {
      expect(isUpdate('1.0.0', '1.1.0')).toBe('new copy');
    });

    test('a manifest that pins "version" keeps users on the cached copy however many commits are pushed', () => {
      const installed = afterPush(FIRST, '1.0.0');
      expect(isUpdate(installed, afterPush(SECOND, '1.0.0'))).toBe('unchanged');
      expect(isUpdate(installed, afterPush(FIRST, '1.0.0'))).toBe('unchanged');
    });

    test('the author changing the string is what releases it', () => {
      expect(isUpdate(afterPush(FIRST, '1.0.0'), afterPush(SECOND, '1.0.1'))).toBe('new copy');
    });

    test('a version left out of both the manifest and the entry tracks the commits', () => {
      const installed = afterPush(FIRST);
      expect(isUpdate(installed, afterPush(FIRST))).toBe('unchanged');
      expect(isUpdate(installed, afterPush(SECOND))).toBe('new copy');
    });

    test('an entry version pins the same way when the manifest sets none', () => {
      expect(
        isUpdate(afterPush(FIRST, undefined, '2.0.0'), afterPush(SECOND, undefined, '2.0.0')),
      ).toBe('unchanged');
    });

    test('the same version on two refs does not update', () => {
      const stable = afterPush(FIRST, '1.0.0');
      const latest = afterPush(SECOND, '1.0.0');
      expect(isUpdate(stable, latest)).toBe('unchanged');
    });
  });

  describe('a plugin loaded in place', () => {
    const relative: PluginSource = { kind: 'relative', path: 'plugins/a', bare: false };
    const local: MarketplaceSource = { kind: 'directory', path: '/work/market' };
    const hosted: MarketplaceSource = {
      kind: 'github',
      repo: 'o/r',
      path: '.claude-plugin/marketplace.json',
    };
    const subject = (source: PluginSource, origin: MarketplaceSource, commit: string) => ({
      from: 'marketplace' as const,
      source,
      origin,
      version: { source: { kind: 'github' as const, commit } },
    });

    test('is not controlled by its version string: a changed version of a relative path in a local marketplace is not a new copy, the same plugin from a github marketplace is', () => {
      const installed = afterPush(FIRST);
      expect(checkForUpdate(subject(relative, local, SECOND), installed)).toBe('loaded in place');
      expect(checkForUpdate(subject(relative, hosted, SECOND), installed)).toBe('new copy');
    });

    test('loads in place from a marketplace added from a local path, as a relative path', () => {
      expect(loadsInPlace(relative, local)).toBe(true);
      expect(loadsInPlace(relative, { kind: 'file', path: '/work/market/marketplace.json' })).toBe(
        true,
      );
    });

    test('is not how a marketplace cloned from git installs a relative path: it is copied into the cache', () => {
      expect(loadsInPlace(relative, hosted)).toBe(false);
    });

    test('loads in place for a command source in link mode, and is copied in copy mode', () => {
      const command = (mode: 'copy' | 'link'): PluginSource => ({
        kind: 'command',
        command: 'my-tool path',
        timeoutSeconds: 120,
        mode,
      });
      expect(loadsInPlace(command('link'), local)).toBe(true);
      expect(loadsInPlace(command('copy'), local)).toBe(false);
    });

    test('is not how any remote source installs: github, url, git-subdir, npm and archive are copied', () => {
      const sources: PluginSource[] = [
        { kind: 'github', repo: 'o/r' },
        { kind: 'url', url: 'https://example.com/r.git' },
        { kind: 'git-subdir', url: 'https://example.com/r.git', path: 'p' },
        { kind: 'npm', package: 'pkg' },
        { kind: 'archive', url: 'https://example.com/p.zip' },
      ];
      for (const source of sources) expect(loadsInPlace(source, local)).toBe(false);
    });
  });

  describe('a plugin from a marketplace hosted on claude.ai', () => {
    test('its version is the one claude.ai records: the subject has no manifest version to read', () => {
      expect(checkForUpdate({ from: 'claude-ai', recordedVersion: '4' }, '4')).toBe('unchanged');
      expect(checkForUpdate({ from: 'claude-ai', recordedVersion: '5' }, '4')).toBe('new copy');
    });
  });

  describe('a plugin from a marketplace', () => {
    test('is judged by its computed version', () => {
      const subject = (commit: string) => ({
        from: 'marketplace' as const,
        source: { kind: 'github' as const, repo: 'o/r' },
        origin: { kind: 'github' as const, repo: 'o/m', path: 'marketplace.json' },
        version: {
          manifestVersion: '1.0.0',
          source: { kind: 'github' as const, commit },
        },
      });
      expect(checkForUpdate(subject(SECOND), afterPush(FIRST, '1.0.0'))).toBe('unchanged');
      expect(checkForUpdate(subject(SECOND), afterPush(FIRST))).toBe('new copy');
    });
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a version that goes backwards is a different version: versions are compared as strings, never ranked', () => {
    expect(isUpdate('2.0.0', '1.0.0')).toBe('new copy');
  });

  test('a relative path is copied, not loaded in place, when its marketplace came from no local path or is unknown', () => {
    const relative: PluginSource = { kind: 'relative', path: 'plugins/a', bare: false };
    const origins: (MarketplaceSource | undefined)[] = [
      undefined,
      { kind: 'skills-dir' },
      { kind: 'url', url: 'https://example.com/marketplace.json' },
      { kind: 'git', url: 'https://example.com/m.git', path: '.claude-plugin/marketplace.json' },
      { kind: 'settings', name: 'inline', plugins: [] },
    ];
    for (const origin of origins) expect(loadsInPlace(relative, origin)).toBe(false);
  });

  test('a plugin with no recorded version has nothing cached: it installs', () => {
    expect(isUpdate(undefined, '1.0.0')).toBe('new copy');
    expect(isUpdate(undefined, 'unknown')).toBe('new copy');
  });

  test('"unknown" against "unknown" is unchanged: an npm or non-git local plugin has nothing to compare', () => {
    expect(isUpdate('unknown', 'unknown')).toBe('unchanged');
  });

  test('versions are compared as strings: the case and a trailing space matter', () => {
    expect(isUpdate('1.0.0', '1.0.0 ')).toBe('new copy');
    expect(isUpdate('abc', 'ABC')).toBe('new copy');
  });
});
