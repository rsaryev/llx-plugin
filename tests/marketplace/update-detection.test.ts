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
 * backwards, which plugins load in place) is tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import { checkForUpdate, isUpdate, loadsInPlace } from '../../src/marketplace/update-detection.ts';
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
    test('the same version leaves the cached copy: "is already at the latest version"', () => {
      expect(isUpdate('1.0.0', '1.0.0')).toBe('unchanged');
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

    test('a version that goes backwards is a different version: the docs compare, never rank', () => {
      expect(isUpdate('2.0.0', '1.0.0')).toBe('new copy');
    });
  });

  describe('a plugin loaded in place', () => {
    test('is not controlled by its version string: current files load at every session start', () => {
      expect(checkForUpdate({ from: 'in-place' }, '1.0.0')).toBe('loaded in place');
    });

    test('loads in place from a marketplace added from a local path, as a relative path', () => {
      const relative: PluginSource = { kind: 'relative', path: 'plugins/a', bare: false };
      expect(loadsInPlace(relative, { kind: 'directory', path: '/work/market' })).toBe(true);
      expect(loadsInPlace(relative, { kind: 'file', path: '/work/market/marketplace.json' })).toBe(
        true,
      );
    });

    test('is not how a marketplace cloned from git installs a relative path: it is copied into the cache', () => {
      const relative: PluginSource = { kind: 'relative', path: 'plugins/a', bare: false };
      const hosted: MarketplaceSource = {
        kind: 'github',
        repo: 'o/r',
        path: '.claude-plugin/marketplace.json',
      };
      expect(loadsInPlace(relative, hosted)).toBe(false);
      expect(loadsInPlace(relative, undefined)).toBe(false);
    });

    test('loads in place for a command source in link mode, and is copied in copy mode', () => {
      const command = (mode: 'copy' | 'link'): PluginSource => ({
        kind: 'command',
        command: 'my-tool path',
        timeoutSeconds: 120,
        mode,
      });
      const local: MarketplaceSource = { kind: 'directory', path: '/work/market' };
      expect(loadsInPlace(command('link'), local)).toBe(true);
      expect(loadsInPlace(command('copy'), local)).toBe(false);
    });

    test('is not how any remote source installs: github, url, git-subdir, npm and archive are copied', () => {
      const local: MarketplaceSource = { kind: 'directory', path: '/work/market' };
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
    test('its version is the one claude.ai records, and the manifest version is not read', () => {
      expect(
        checkForUpdate({ from: 'claude-ai', recordedVersion: '4', manifestVersion: '9.9.9' }, '4'),
      ).toBe('unchanged');
      expect(
        checkForUpdate({ from: 'claude-ai', recordedVersion: '5', manifestVersion: '9.9.9' }, '4'),
      ).toBe('new copy');
    });
  });

  describe('a plugin from a marketplace', () => {
    test('is judged by its computed version', () => {
      const subject = (commit: string) => ({
        from: 'marketplace' as const,
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
