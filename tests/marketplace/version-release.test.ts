/**
 * plugins/host-marketplace.md § Keep users up to date → Release a new version; plugins/publish.md §
 * Ship updates, renames, and removals → Release a new version, § Publish through your own
 * marketplace → Ship updates to users. The version rule is `computePluginVersion`, the update check
 * `checkForUpdate`; each id asserts what its own page adds: bump or omit `version`, and what a user
 * receives on request or by auto-update. Holding users on a version and tagging a release are in
 * hold-version.test.ts, the release channels in release-channels.test.ts. The auto-update pass itself
 * is proven under `updates.loading.Which marketplaces and plugins auto-update`, not here.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginIssue } from '../../src/format/issues.ts';
import { validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import { computePluginVersion } from '../../src/marketplace/plugin-version.ts';
import {
  checkForUpdate,
  isUpdate,
  upToDateMessage,
} from '../../src/marketplace/update-detection.ts';
import { plan } from '../support/marketplace-registry.ts';
import { spec } from '../support/spec.ts';

const FIRST = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SECOND = '0123456789abcdef0123456789abcdef01234567';

/** The version a user's copy has after the author pushed `commit` with the given declared versions. */
const versionAt = (commit: string, manifestVersion?: string, entryVersion?: string): string =>
  computePluginVersion({
    ...(manifestVersion === undefined ? {} : { manifestVersion }),
    ...(entryVersion === undefined ? {} : { entryVersion }),
    source: { kind: 'github', commit },
  });

const messages = (issues: readonly PluginIssue[]): string[] => issues.map((i) => i.message);

spec('updates.hosting.Release a new version', () => {
  describe('users get a new copy only when the computed version differs', () => {
    test('changing the plugin version releases it', () => {
      const installed = versionAt(FIRST, '1.0.0');
      expect(isUpdate(installed, versionAt(SECOND, '1.1.0'))).toBe('new copy');
    });

    test('bumping version on each release: pushing commits without changing "1.0.0" reaches nobody', () => {
      const installed = versionAt(FIRST, '1.0.0');
      expect(isUpdate(installed, versionAt(SECOND, '1.0.0'))).toBe('unchanged');
    });

    test('omitting version from plugin.json and the entry: users track the commits', () => {
      const installed = versionAt(FIRST);
      expect(isUpdate(installed, versionAt(SECOND))).toBe('new copy');
      expect(isUpdate(installed, versionAt(FIRST))).toBe('unchanged');
    });

    test('the version comes from plugin.json first, then from the marketplace entry', () => {
      expect(versionAt(FIRST, '1.0.0', '2.0.0')).toBe('1.0.0');
      expect(versionAt(FIRST, undefined, '2.0.0')).toBe('2.0.0');
    });
  });

  describe('a plugin loaded in place from a marketplace added from a local path', () => {
    test('is not controlled by version: it loads the current files at every session start, whatever the string says', () => {
      const subject = (manifestVersion: string) => ({
        from: 'marketplace' as const,
        source: { kind: 'relative', path: 'p', bare: false } as const,
        origin: { kind: 'directory', path: '/work/market' } as const,
        version: { manifestVersion, source: { kind: 'relative' } as const },
      });
      expect(checkForUpdate(subject('1.1.0'), '1.0.0')).toBe('loaded in place');
      expect(checkForUpdate(subject('1.0.0'), '1.0.0')).toBe('loaded in place');
    });
  });

  describe('a version in both plugin.json and the entry', () => {
    test('plugin.json is used without warning at install time', () => {
      expect(versionAt(FIRST, '1.0.0', '2.0.0')).toBe('1.0.0');
    });

    test('claude plugin validate reports the mismatch as Entry declares version "<a>" but <path>/plugin.json says "<b>"', () => {
      const raw = {
        name: 'your-marketplace',
        owner: { name: 'Your Org' },
        plugins: [{ name: 'my-plugin', source: './plugins/my-plugin', version: '1.0.0' }],
      };
      const issues = validateMarketplace(raw, {
        pluginManifests: new Map([[0, { name: 'my-plugin', version: '2.0.0' }]]),
      });
      const [found] = issues.filter((i) => i.message.startsWith('Entry declares version'));
      expect(found?.message).toStartWith(
        'Entry declares version "1.0.0" but plugins/my-plugin/.claude-plugin/plugin.json says "2.0.0"',
      );
    });

    test('the same version in both says nothing', () => {
      const raw = {
        name: 'your-marketplace',
        owner: { name: 'Your Org' },
        plugins: [{ name: 'my-plugin', source: './plugins/my-plugin', version: '2.0.0' }],
      };
      const issues = validateMarketplace(raw, {
        pluginManifests: new Map([[0, { name: 'my-plugin', version: '2.0.0' }]]),
      });
      expect(messages(issues).filter((m) => m.startsWith('Entry declares version'))).toEqual([]);
    });
  });
});

/** An update check of a plugin of the author's own git-hosted marketplace, as a host runs it. */
const checkOwn = (commit: string, manifestVersion: string, installed: string) =>
  checkForUpdate(
    {
      from: 'marketplace',
      source: { kind: 'github', repo: 'your-org/p' },
      origin: { kind: 'github', repo: 'your-org/your-marketplace', path: 'marketplace.json' },
      version: { manifestVersion, source: { kind: 'github', commit } },
    },
    installed,
  );

spec('updates.publish.Release a new version', () => {
  test('incrementing the plugin.json version and pushing gives users a new copy', () => {
    expect(checkOwn(SECOND, '1.5.0', versionAt(FIRST, '1.4.0'))).toBe('new copy');
  });

  test('pushing the same version string is not a release: users keep the cached copy', () => {
    expect(checkOwn(SECOND, '1.4.0', versionAt(FIRST, '1.4.0'))).toBe('unchanged');
  });
});

spec('updates.publish.Ship updates to users', () => {
  test('on request: an unchanged version installs nothing and prints "<name> is already at the latest version (<version>)."', () => {
    const installed = versionAt(FIRST, '1.0.0');
    expect(checkOwn(SECOND, '1.0.0', installed)).toBe('unchanged');
    expect(upToDateMessage('deploy-helper', '1.0.0')).toBe(
      'deploy-helper is already at the latest version (1.0.0).',
    );
    expect(checkOwn(SECOND, '1.1.0', installed)).toBe('new copy');
  });

  test('auto-update is off by default for your marketplace', () => {
    const registered = plan([
      [
        'user',
        {
          extraKnownMarketplaces: {
            'your-marketplace': { source: { source: 'github', repo: 'your-org/your-marketplace' } },
          },
        },
      ],
    ]);
    expect(registered.map((r) => [r.name, r.entry.autoUpdate])).toEqual([
      ['your-marketplace', false],
    ]);
  });

  test('turning it on is the marketplace entry setting autoUpdate', () => {
    const on = plan([
      [
        'managed',
        {
          extraKnownMarketplaces: {
            'your-marketplace': {
              source: { source: 'github', repo: 'your-org/your-marketplace' },
              autoUpdate: true,
            },
          },
        },
      ],
    ]);
    expect(on.map((r) => [r.name, r.entry.autoUpdate])).toEqual([['your-marketplace', true]]);
  });
});
