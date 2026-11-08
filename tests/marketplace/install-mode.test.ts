/**
 * plugins/loading.md § In-place and copied plugins; plugins/host-marketplace.md § Edit plugins in
 * place on a shared directory; plugins/marketplace-reference.md § Relative path plugin source, §
 * Copy mode and link mode. How a plugin is installed is decided from where it came from.
 */
import { describe, expect, test } from 'bun:test';
import type { MarketplaceSource, PluginSource } from '../../src/format/marketplace/types.ts';
import { parsePluginSource } from '../../src/format/marketplace/plugin-source.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import {
  decideInstallMode,
  linkedPluginLoads,
  type InstallDecision,
  type InstallOrigin,
} from '../../src/marketplace/install-mode.ts';
import { slotAt } from '../support/marketplace-entries.ts';
import { spec } from '../support/spec.ts';

const relative: PluginSource = { kind: 'relative', path: 'plugins/formatter', bare: false };
const command = (mode: 'copy' | 'link'): PluginSource => ({
  kind: 'command',
  command: 'my-tool claude-plugin-path',
  timeoutSeconds: 60,
  mode,
});
const from = (marketplace: MarketplaceSource['kind'], source: PluginSource): InstallOrigin => ({
  kind: 'marketplace',
  marketplace,
  source,
});

const decide = (
  origin: InstallOrigin,
  platform: 'posix' | 'windows' = 'posix',
): InstallDecision => {
  const decided = decideInstallMode({ origin, platform });
  if ('severity' in decided) throw new Error(`refused: ${decided.message}`);
  return decided;
};

spec('install.loading.In-place and copied plugins', () => {
  test('a --plugin-dir directory loads in place and is never copied', () => {
    expect(decide({ kind: 'session-directory' })).toMatchObject({
      mode: 'in-place',
      extractFirst: false,
      cached: false,
    });
  });

  test('a --plugin-dir .zip or a --plugin-url archive is extracted into a session temp directory first, then loads in place', () => {
    expect(decide({ kind: 'session-archive' })).toMatchObject({
      mode: 'in-place',
      extractFirst: true,
      cached: false,
    });
  });

  test('a skills-directory plugin loads in place', () => {
    expect(decide({ kind: 'skills-directory' })).toMatchObject({ mode: 'in-place', cached: false });
  });

  test('a relative-path plugin of a marketplace added from a local path loads in place, from its path inside the marketplace', () => {
    for (const marketplace of ['directory', 'file'] as const) {
      expect(decide(from(marketplace, relative))).toMatchObject({
        mode: 'in-place',
        cached: false,
        editsNeedUpdate: false,
      });
    }
  });

  test('a command source in link mode loads in place, through links in the cache entry', () => {
    expect(decide(from('github', command('link')))).toMatchObject({
      mode: 'link-in-cache',
      linked: true,
      cached: true,
    });
  });

  test('every other marketplace plugin is copied into the cache', () => {
    const sources: readonly PluginSource[] = [
      { kind: 'github', repo: 'acme/formatter' },
      { kind: 'url', url: 'https://example.com/r.git' },
      { kind: 'git-subdir', url: 'https://example.com/r.git', path: 'p' },
      { kind: 'npm', package: '@acme/formatter' },
      { kind: 'archive', url: 'https://example.com/f.zip' },
      command('copy'),
    ];
    for (const source of sources) {
      expect(decide(from('directory', source))).toMatchObject({ mode: 'copy', cached: true });
    }
  });

  test('a relative-path plugin of a marketplace cloned from GitHub, git or fetched by URL is copied, not loaded in place', () => {
    for (const marketplace of ['github', 'git', 'url'] as const) {
      expect(decide(from(marketplace, relative))).toMatchObject({
        mode: 'copy',
        editsNeedUpdate: true,
      });
    }
  });

  test('a marketplace plugin with no known marketplace is copied', () => {
    expect(decide({ kind: 'marketplace', source: relative })).toMatchObject({ mode: 'copy' });
  });
});

spec('marketplace.hosting.Edit plugins in place on a shared directory', () => {
  test('a relative-path plugin of a marketplace added from a shared directory is read in place, so an edit needs no update or version bump', () => {
    const decided = decide(from('directory', relative));
    expect(decided.mode).toBe('in-place');
    expect(decided.editsNeedUpdate).toBe(false);
  });

  test('a copied plugin is a snapshot: an edit reaches users only through an update', () => {
    expect(decide(from('github', relative)).editsNeedUpdate).toBe(true);
  });
});

const PLUGIN_SOURCES = 'marketplace.rule.Relative path plugin source';
const withOrigin = (origin: MarketplaceSource) =>
  planPluginFetch(relative, { platform: 'posix', marketplaceOrigin: origin });

spec(`${PLUGIN_SOURCES}.github, git, file, and directory`, () => {
  test('Claude Code has the marketplace files, so the relative path resolves from the marketplace root', () => {
    const origins: readonly MarketplaceSource[] = [
      { kind: 'github', repo: 'acme/m', path: '.claude-plugin/marketplace.json' },
      { kind: 'git', url: 'https://example.com/m.git', path: '.claude-plugin/marketplace.json' },
      { kind: 'file', path: '/m/.claude-plugin/marketplace.json' },
      { kind: 'directory', path: '/m' },
    ];
    for (const origin of origins) {
      expect(withOrigin(origin)).toMatchObject({
        plan: { kind: 'local', fromMarketplaceRoot: 'plugins/formatter' },
        issues: [],
      });
    }
  });
});

spec(`${PLUGIN_SOURCES}.url`, () => {
  test('Claude Code fetches only marketplace.json, so a relative path cannot resolve', () => {
    const result = withOrigin({ kind: 'url', url: 'https://example.com/marketplace.json' });
    expect(result.plan).toBeUndefined();
    expect(result.issues[0]?.message).toContain(
      'its marketplace entry path does not stay inside the marketplace directory',
    );
    expect(result.issues[0]?.message).toContain('github, url or git-subdir');
  });
});

spec(`${PLUGIN_SOURCES}.settings`, () => {
  test('relative paths are rejected outright in a marketplace declared in settings', () => {
    const result = withOrigin({ kind: 'settings', name: 'inline', plugins: [] });
    expect(result.plan).toBeUndefined();
    expect(result.issues[0]?.message).toContain('rejected');
  });
});

const COPY_LINK = 'marketplace.rule.Copy mode and link mode';

spec(COPY_LINK, () => {
  test('`mode` decides whether Claude Code copies the printed directory or uses it in place', () => {
    const copied = decide(from('github', command('copy')));
    const linked = decide(from('github', command('link')));
    expect([copied.mode, copied.cached, copied.linked]).toEqual(['copy', true, false]);
    expect([linked.mode, linked.cached, linked.linked]).toEqual(['link-in-cache', true, true]);
    expect(copied.editsNeedUpdate).toBe(true);
    expect(linked.editsNeedUpdate).toBe(false);
  });
});

spec(`${COPY_LINK}.copy`, () => {
  test('copy mode copies the printed directory into the plugin cache', () => {
    expect(decide(from('github', command('copy')))).toMatchObject({
      mode: 'copy',
      cached: true,
      linked: false,
    });
  });

  test('a command source that names no mode is read as copy, and is installed that way', () => {
    const { source } = parsePluginSource({ source: 'command', command: 'my-tool path' }, slotAt());
    if (source === undefined) throw new Error('expected a source');
    expect(decide(from('github', source))).toMatchObject({ mode: 'copy', cached: true });
  });
});

spec(`${COPY_LINK}.link`, () => {
  test('link mode fills the cache entry with links and copies nothing', () => {
    const decided = decide(from('github', command('link')));
    expect(decided).toMatchObject({ mode: 'link-in-cache', linked: true, editsNeedUpdate: false });
  });
});

spec(`${COPY_LINK}.Include node_modules`, () => {
  test('Claude Code skips the Node.js package dependency install for a link-mode plugin, and installs it for a copy', () => {
    expect(decide(from('github', command('link'))).dependencyInstall).toBe(false);
    expect(decide(from('github', command('copy'))).dependencyInstall).toBe(true);
  });

  test('a plugin loaded in place from a local marketplace gets no install into the source directory either', () => {
    expect(decide(from('directory', relative)).dependencyInstall).toBe(false);
  });
});

spec(`${COPY_LINK}.Not on Windows`, () => {
  test('Claude Code refuses to install a link-mode plugin on Windows', () => {
    const refused = decideInstallMode({
      origin: from('github', command('link')),
      platform: 'windows',
    });
    expect('severity' in refused && refused.message).toContain('Windows');
    expect('severity' in refused && refused.message).toContain('"mode": "copy"');
  });

  test('copy mode installs on Windows', () => {
    expect(decide(from('github', command('copy')), 'windows').mode).toBe('copy');
  });
});

spec(`${COPY_LINK}.Sessions started inside the directory`, () => {
  const link = decide(from('github', command('link')));

  test('a session started in the printed directory or anywhere below it does not load the plugin', () => {
    for (const sessionCwd of ['/opt/tool/out', '/opt/tool/out/src/deep']) {
      expect(linkedPluginLoads(link, { directory: '/opt/tool/out', sessionCwd }, 'posix')).toBe(
        false,
      );
    }
  });

  test('a session started elsewhere does', () => {
    for (const sessionCwd of ['/work/app', '/opt/tool/other', '/opt/tool/output', undefined]) {
      expect(
        linkedPluginLoads(
          link,
          { directory: '/opt/tool/out', ...(sessionCwd === undefined ? {} : { sessionCwd }) },
          'posix',
        ),
      ).toBe(true);
    }
  });

  test('a copy loads wherever the session started', () => {
    const copy = decide(from('github', command('copy')));
    expect(
      linkedPluginLoads(copy, { directory: '/opt/tool/out', sessionCwd: '/opt/tool/out' }, 'posix'),
    ).toBe(true);
  });
});

describe('judgments: the printed directory', () => {
  test('a printed directory that is the session directory or one of its parents fails the install, in any mode', () => {
    for (const mode of ['copy', 'link'] as const) {
      const refused = decideInstallMode({
        origin: from('github', command(mode)),
        platform: 'posix',
        printed: { directory: '/work', sessionCwd: '/work/app' },
      });
      expect('severity' in refused && refused.message).toContain('started in');
    }
  });
});
