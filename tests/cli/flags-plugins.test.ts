/**
 * cli-reference.md § CLI flags (`--plugin-dir`: a directory or `.zip`, or a folder of plugins, for
 * this session only, one path per flag, repeat the flag for more, a folder of plugins from Claude
 * Code 2.1.265; `--plugin-url`: a `.zip` from a URL for this session only, repeat the flag or pass
 * space-separated URLs in one quoted value), plugins/cli-reference.md § Flags that load a plugin for
 * one session (session-only plugins are `<name>@inline`; managed `disableSideloadFlags` rejects both
 * flags and the folders of `CLAUDE_CODE_PLUGIN_DIRS`, and Claude Code exits `1` without starting) and
 * plugins/org.md (`disableSideloadFlags` also rejects `--agents` and `--mcp-config`). The ids of that
 * plugins page and the choice of which same-named copy loads are the install stream's; the
 * rejection tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { pluginFoldersOf } from '../../src/cli/flags/plugins.ts';
import { sideloadMessage } from '../../src/cli/flags/sideload.ts';
import { startupRefusal } from '../../src/cli/session-flags.ts';
import { sideloadRefusal as modsRefusal } from '../../src/mods/index.ts';
import { renderCommand } from '../../src/cli/result.ts';
import { planOf } from '../support/session-flags.ts';
import { spec } from '../support/spec.ts';

spec('cli.flag.--plugin-dir', () => {
  test('a path to a directory is a session-only plugin request of the inline origin', () => {
    expect(planOf({ '--plugin-dir': ['./my-plugin'] }).sessionPlugins).toEqual([
      { source: 'directory', location: './my-plugin', origin: 'inline' },
    ]);
  });

  test('a .zip archive is read as an archive', () => {
    expect(planOf({ '--plugin-dir': ['./other.zip'] }).sessionPlugins).toEqual([
      { source: 'archive', location: './other.zip', origin: 'inline' },
    ]);
  });

  test('each flag takes one path: repeat it for more, in the order given', () => {
    const plan = planOf({ '--plugin-dir': ['A', 'B.zip', 'C'] });
    expect(plan.sessionPlugins.map((request) => request.location)).toEqual(['A', 'B.zip', 'C']);
  });

  test('a path with a space in it stays one path', () => {
    expect(planOf({ '--plugin-dir': ['./my plugin'] }).sessionPlugins).toHaveLength(1);
  });

  test('a folder of plugins loads each child folder that holds a .claude-plugin/plugin.json', () => {
    const reading = { isFolder: true, plugins: ['a', 'b'] };
    const [request] = planOf({ '--plugin-dir': ['./parent'] }).sessionPlugins;
    expect(request && pluginFoldersOf(request, reading)).toEqual(['./parent/a', './parent/b']);
  });

  test('a folder that is itself a plugin loads as one, and an archive is one', () => {
    const [directory, archive] = planOf({ '--plugin-dir': ['./p', './p.zip'] }).sessionPlugins;
    const reading = { isFolder: false, plugins: [] };
    expect(directory && pluginFoldersOf(directory, reading)).toEqual(['./p']);
    expect(archive && pluginFoldersOf(archive, reading)).toEqual(['./p.zip']);
  });

  test('passing a folder of plugins requires Claude Code 2.1.265', () => {
    const reading = { isFolder: true, plugins: ['a'] };
    const [request] = planOf({ '--plugin-dir': ['./parent/'] }).sessionPlugins;
    expect(request && pluginFoldersOf(request, reading, '2.1.264')).toEqual([]);
    expect(request && pluginFoldersOf(request, reading, '2.1.265')).toEqual(['./parent/a']);
  });

  test('the plugin is for this session only: it names no installation and no settings write', () => {
    const plan = planOf({ '--plugin-dir': ['./p'] });
    expect(plan.sessionPlugins.every((request) => request.origin === 'inline')).toBe(true);
    expect(plan.flagSettings).toBeUndefined();
  });

  test('no flag, no session plugins', () => {
    expect(planOf({}).sessionPlugins).toEqual([]);
  });
});

spec('cli.flag.--plugin-url', () => {
  test('a URL is fetched as a plugin .zip archive for this session only', () => {
    expect(planOf({ '--plugin-url': ['https://example.com/plugin.zip'] }).sessionPlugins).toEqual([
      { source: 'url', location: 'https://example.com/plugin.zip', origin: 'inline' },
    ]);
  });

  test('repeating the flag loads several', () => {
    const plan = planOf({
      '--plugin-url': ['https://example.com/a.zip', 'https://example.com/b.zip'],
    });
    expect(plan.sessionPlugins.map((request) => request.location)).toEqual([
      'https://example.com/a.zip',
      'https://example.com/b.zip',
    ]);
  });

  test('space-separated URLs in one quoted value load one plugin each', () => {
    const plan = planOf({
      '--plugin-url': ['https://example.com/a.zip https://example.com/b.zip'],
    });
    expect(plan.sessionPlugins.map((request) => request.location)).toEqual([
      'https://example.com/a.zip',
      'https://example.com/b.zip',
    ]);
  });

  test('both ways at once, and extra spaces or newlines between URLs, make no empty request', () => {
    const plan = planOf({
      '--plugin-url': ['https://e.com/a.zip   https://e.com/b.zip\n', ' ', 'https://e.com/c.zip'],
    });
    expect(plan.sessionPlugins.map((request) => request.location)).toEqual([
      'https://e.com/a.zip',
      'https://e.com/b.zip',
      'https://e.com/c.zip',
    ]);
  });

  test('--plugin-dir requests come before --plugin-url ones', () => {
    const plan = planOf({ '--plugin-url': ['https://e.com/a.zip'], '--plugin-dir': ['./p'] });
    expect(plan.sessionPlugins.map((request) => request.source)).toEqual(['directory', 'url']);
  });
});

describe('what the docs leave open', () => {
  test('the .zip extension is matched without regard to case', () => {
    expect(planOf({ '--plugin-dir': ['./UPPER.ZIP'] }).sessionPlugins).toEqual([
      { source: 'archive', location: './UPPER.ZIP', origin: 'inline' },
    ]);
  });
});

describe('disableSideloadFlags', () => {
  const sideloaded = { sideloadDisabled: true };

  test('rejects --plugin-dir and --plugin-url: the flag is disabled by managed settings and the run exits 1', () => {
    for (const given of [
      { '--plugin-dir': ['./x'] },
      { '--plugin-url': ['https://e.com/a.zip'] },
    ] as const) {
      const plan = planOf(given, sideloaded);
      expect(plan.refusals).toHaveLength(1);
      expect(plan.refusals[0]).toContain("disabled by your organization's managed settings");
      expect(plan.refusals[0]).toContain('disableSideloadFlags');
      expect(plan.sessionPlugins).toEqual([]);
      const rendered = renderCommand(startupRefusal(plan) ?? { kind: 'usage-error', reason: '' }, {
        json: false,
      });
      expect(rendered.exitCode).toBe(1);
    }
  });

  test('names the flag, in the words mods/load prints', () => {
    const plan = planOf({ '--plugin-dir': ['./x'] }, sideloaded);
    expect(plan.refusals).toEqual([sideloadMessage('--plugin-dir')]);
    const mods = modsRefusal({
      managed: { disableSideloadFlags: true },
      user: {},
      credential: 'none',
      env: {},
      platform: 'posix',
      flags: { pluginDirs: ['./x'] },
    });
    expect(plan.refusals[0]).toBe(mods);
  });

  test('also rejects --agents, and --mcp-config unless every server is type sdk', () => {
    expect(planOf({ '--agents': '{}' }, sideloaded).refusals[0]).toContain('--agents');
    const external = '{"mcpServers":{"a":{"type":"http","url":"https://x"}}}';
    expect(planOf({ '--mcp-config': [external] }, sideloaded).refusals[0]).toContain(
      '--mcp-config',
    );
    const inProcess = '{"mcpServers":{"a":{"type":"sdk","name":"a"}}}';
    expect(planOf({ '--mcp-config': [inProcess] }, sideloaded).refusals).toEqual([]);
  });

  test('rejects folders named in CLAUDE_CODE_PLUGIN_DIRS at startup too', () => {
    const plan = planOf({}, { ...sideloaded, env: { CLAUDE_CODE_PLUGIN_DIRS: '/work/plugin' } });
    expect(plan.refusals[0]).toContain('CLAUDE_CODE_PLUGIN_DIRS');
    expect(planOf({}, { ...sideloaded, env: {} }).refusals).toEqual([]);
  });

  test('without the setting, nothing is refused', () => {
    expect(planOf({ '--plugin-dir': ['./x'] }).refusals).toEqual([]);
    expect(planOf({}, { env: { CLAUDE_CODE_PLUGIN_DIRS: '/work/plugin' } }).refusals).toEqual([]);
  });
});
