/**
 * plugins/create.md § Load a plugin from a directory or `.zip`, § Load a folder of plugins, § Load a
 * plugin from a URL, § Load plugins from an environment variable, § Stop loading the plugin;
 * plugins/cli-reference.md § Flags that load a plugin for one session; plugins/loading.md § In-place
 * and copied plugins, § Find where a plugin came from.
 */
import { describe, expect, test } from 'bun:test';
import { decideInstallMode } from '../../src/marketplace/install-mode.ts';
import {
  fetchSessionArchives,
  folderChanges,
  pluginDirArgument,
  pluginUrls,
} from '../../src/marketplace/session-plugins.ts';
import { readPluginDirectory } from '../../src/loading/plugin-folder.ts';
import {
  copyThatLoads,
  inlinePluginId,
  sessionOnlyRow,
  skillsDirPluginId,
  stopLoadingSkillsDirPlugin,
} from '../../src/marketplace/session-origins.ts';
import { MOD_SETTINGS } from '../../src/protocol/mods-settings.ts';
import { parsePluginDirs, pluginDirsOf, sideloadRefusal } from '../../src/mods/load/plugin-dirs.ts';
import { fakeArchive, fakeSha256 } from '../support/marketplace-ports.ts';
import { stats } from '../support/marketplace-archive.ts';
import { policy } from '../support/mods-load.ts';
import { memoryFiles, recordingHttp, type HttpReply } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const signal = new AbortController().signal;

const decide = (kind: 'session-directory' | 'session-archive') => {
  const decided = decideInstallMode({ origin: { kind }, platform: 'posix' });
  if ('severity' in decided) throw new Error('refused');
  return decided;
};

spec('install.develop.Load a plugin from a directory or .zip', () => {
  test('--plugin-dir takes the plugin root directory or a .zip archive of it, and repeating the flag loads several', () => {
    expect(
      ['./my-first-plugin', './other-plugin.zip', './UPPER.ZIP', './zip'].map(pluginDirArgument),
    ).toEqual(['directory', 'archive', 'archive', 'directory']);
  });

  test('a directory loads in place and a .zip is extracted into a session temp directory first', () => {
    expect(decide('session-directory')).toMatchObject({ mode: 'in-place', extractFirst: false });
    expect(decide('session-archive')).toMatchObject({ mode: 'in-place', extractFirst: true });
  });

  test('nothing about it is installed: the plugin is a session-only <name>@inline', () => {
    expect(inlinePluginId('my-first-plugin')).toBe('my-first-plugin@inline');
  });
});

const plugin = (name: string) => ({ [`${name}/.claude-plugin/plugin.json`]: '{"name":"x"}' });

spec('install.develop.Load a folder of plugins', () => {
  test('a folder with no .claude-plugin/ directory and no plugin components is a folder of plugins: each immediate subfolder with a manifest loads', async () => {
    const files = memoryFiles({
      ...plugin('alpha'),
      ...plugin('beta'),
      'no-manifest/skills/a/SKILL.md': 'x',
      'README.md': 'x',
      'deep/nested/.claude-plugin/plugin.json': '{}',
    });
    expect(await readPluginDirectory(files)).toEqual({
      isFolder: true,
      plugins: ['alpha', 'beta'],
    });
  });

  test('everything else is skipped without an error, including a subfolder that has no manifest', async () => {
    const files = memoryFiles({ 'only/skills/a/SKILL.md': 'x', 'notes.txt': 'x' });
    expect(await readPluginDirectory(files)).toEqual({ isFolder: true, plugins: [] });
  });

  test('a folder with a .claude-plugin/ manifest, or with plugin components at its top level, is one plugin', async () => {
    for (const layout of [
      { '.claude-plugin/plugin.json': '{}', ...plugin('inner') },
      { 'skills/a/SKILL.md': 'x', ...plugin('inner') },
      { 'commands/c.md': 'x' },
      { 'hooks/hooks.json': '{}' },
      { '.mcp.json': '{}' },
      { 'SKILL.md': 'x' },
    ]) {
      expect(await readPluginDirectory(memoryFiles(layout))).toEqual({
        isFolder: false,
        plugins: [],
      });
    }
  });

  test('a folder that keeps .claude-plugin/marketplace.json beside its plugin folders still loads them, while that directory holds no plugin.json', async () => {
    const files = memoryFiles({
      '.claude-plugin/marketplace.json': '{}',
      ...plugin('plugins-a'),
      ...plugin('plugins-b'),
    });
    expect(await readPluginDirectory(files)).toEqual({
      isFolder: true,
      plugins: ['plugins-a', 'plugins-b'],
    });
    const withManifest = memoryFiles({
      '.claude-plugin/marketplace.json': '{}',
      '.claude-plugin/plugin.json': '{}',
      ...plugin('plugins-a'),
    });
    expect((await readPluginDirectory(withManifest)).isFolder).toBe(false);
  });

  test('in an interactive session a subfolder you add loads and one you remove unloads', () => {
    expect(folderChanges(['alpha', 'beta'], ['beta', 'gamma'], false)).toEqual([
      { plugin: 'gamma', change: 'load', applied: true },
      { plugin: 'alpha', change: 'unload', applied: true },
    ]);
    expect(folderChanges(['alpha'], ['alpha'], false)).toEqual([]);
  });

  test('a change that would invalidate the prompt cache is held for /reload-plugins', () => {
    expect(folderChanges(['alpha'], ['alpha', 'beta'], true)).toEqual([
      { plugin: 'beta', change: 'load', applied: false },
    ]);
  });
});

const ZIP = new Uint8Array([80, 75, 3, 4]);
const URL_A = 'https://example.com/a.zip';
const URL_B = 'https://example.com/b.zip';

function archivePorts(replies: readonly HttpReply[]) {
  const http = recordingHttp(...replies);
  return { http, sha256: fakeSha256('0'), archive: fakeArchive(stats()) };
}

spec('install.develop.Load a plugin from a URL', () => {
  test('several URLs are fetched, repeated or space-separated in one quoted argument', () => {
    expect(pluginUrls([URL_A, `${URL_B}  https://example.com/c.zip`, ''])).toEqual([
      URL_A,
      URL_B,
      'https://example.com/c.zip',
    ]);
  });

  test('the archives are downloaded at startup and each is a loaded plugin', async () => {
    const ports = archivePorts([
      { status: 200, bytes: ZIP },
      { status: 200, bytes: ZIP },
    ]);
    const result = await fetchSessionArchives([`${URL_A} ${URL_B}`], ports, { signal });
    expect(result.loaded.map((one) => one.url)).toEqual([URL_A, URL_B]);
    expect(result.errors).toEqual([]);
    expect(ports.http.requests.map((request) => request.url)).toEqual([URL_A, URL_B]);
  });

  test('an archive that cannot be fetched, or is invalid, is a load error, and the rest still load', async () => {
    const http = recordingHttp({ status: 404 }, { status: 200, bytes: ZIP });
    const result = await fetchSessionArchives(
      [URL_A, URL_B],
      { http, sha256: fakeSha256('0'), archive: fakeArchive(stats()) },
      { signal },
    );
    expect(result.loaded.map((one) => one.url)).toEqual([URL_B]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.url).toBe(URL_A);
    expect(result.errors[0]?.issue.message).toContain('404');

    const invalid = await fetchSessionArchives(
      [URL_A],
      {
        http: recordingHttp({ status: 200, bytes: ZIP }),
        sha256: fakeSha256('0'),
        archive: fakeArchive({ failure: 'corrupt', message: 'not a zip' }),
      },
      { signal },
    );
    expect(invalid.loaded).toEqual([]);
    expect(invalid.errors[0]?.issue.message).toContain('not a zip');
  });

  test('a URL that is not https is not fetched at all', async () => {
    const ports = archivePorts([]);
    const result = await fetchSessionArchives(['http://example.com/a.zip'], ports, { signal });
    expect(result.errors).toHaveLength(1);
    expect(ports.http.requests).toEqual([]);
  });

  test('the archive is extracted into a session temp directory and loads in place', () => {
    const decided = decideInstallMode({ origin: { kind: 'session-archive' }, platform: 'posix' });
    expect(decided).toMatchObject({ mode: 'in-place', extractFirst: true });
  });
});

spec(
  [
    'install.develop.Load plugins from an environment variable',
    'environment.host.CLAUDE_CODE_PLUGIN_DIRS',
  ],
  () => {
    test('CLAUDE_CODE_PLUGIN_DIRS lists absolute paths, separated by : (or ; on Windows)', () => {
      expect(parsePluginDirs('/a/one:/b/two', 'posix')).toEqual(['/a/one', '/b/two']);
      expect(parsePluginDirs('C:\\one;D:\\two', 'windows')).toEqual(['C:\\one', 'D:\\two']);
    });

    test('each path loads as a --plugin-dir path does, in addition to the flags', () => {
      const input = policy({
        env: { CLAUDE_CODE_PLUGIN_DIRS: '/a/one:/b/two' },
        flags: { pluginDirs: ['./flag-plugin'] },
      });
      expect(pluginDirsOf(input)).toEqual(['./flag-plugin', '/a/one', '/b/two']);
    });

    test('user settings env can set it; project and local settings cannot', () => {
      const user = policy({ user: { env: { CLAUDE_CODE_PLUGIN_DIRS: '/from/user' } } });
      expect(pluginDirsOf(user)).toEqual(['/from/user']);
      expect(MOD_SETTINGS.CLAUDE_CODE_PLUGIN_DIRS.homes).toEqual(['environment', 'user-env']);
    });

    test('managed settings can turn off --plugin-dir and the variable', () => {
      const off = policy({
        managed: { disableSideloadFlags: true },
        env: { CLAUDE_CODE_PLUGIN_DIRS: '/a/one' },
        flags: { pluginDirs: ['./x'] },
      });
      expect(pluginDirsOf(off)).toEqual([]);
      expect(sideloadRefusal(off)).toContain('--plugin-dir is disabled by your organization');
    });
  },
);

spec('install.develop.Stop loading the plugin', () => {
  test('delete its directory, or run claude plugin disable my-tool@skills-dir', () => {
    expect(stopLoadingSkillsDirPlugin('my-tool')).toEqual({
      deleteDirectory: true,
      disableCommand: 'claude plugin disable my-tool@skills-dir',
    });
  });

  test('skills-dir stands where a marketplace name would', () => {
    expect(skillsDirPluginId('my-tool')).toBe('my-tool@skills-dir');
  });
});

spec('install.plugin.Flags that load a plugin for one session', () => {
  test('a session-only plugin is listed as <name>@inline only when the flag precedes the subcommand, with the session scope', () => {
    expect(sessionOnlyRow('my-plugin', true)).toEqual({
      id: 'my-plugin@inline',
      heading: 'Session-only plugins (--plugin-dir / --plugin-url):',
      scope: 'session',
    });
    expect(sessionOnlyRow('my-plugin', false)).toBeUndefined();
  });

  test('the session-only copy of a name loads, and the installed one is skipped', () => {
    expect(copyThatLoads({ sessionOnlyDisabled: false, managedLocksName: false })).toBe(
      'session-only',
    );
  });

  test('the installed copy loads if the session-only copy was disabled, or managed settings lock the name', () => {
    expect(copyThatLoads({ sessionOnlyDisabled: true, managedLocksName: false })).toBe('installed');
    expect(copyThatLoads({ sessionOnlyDisabled: false, managedLocksName: true })).toBe('installed');
  });

  test('an administrator can reject both flags and the variable with disableSideloadFlags', () => {
    const refused = sideloadRefusal(
      policy({
        managed: { disableSideloadFlags: true },
        flags: { pluginDirs: [], pluginUrls: ['https://example.com/a.zip'] },
      }),
    );
    expect(refused).toContain('--plugin-url is disabled by your organization');
  });
});

describe('judgments: session plugins', () => {
  test('the archive of --plugin-url has the limits of an archive source', async () => {
    const huge = fakeArchive(stats({ entries: 100_001 }));
    const result = await fetchSessionArchives(
      [URL_A],
      { http: recordingHttp({ status: 200, bytes: ZIP }), sha256: fakeSha256('0'), archive: huge },
      { signal },
    );
    expect(result.errors[0]?.issue.message).toContain('100000');
  });
});
