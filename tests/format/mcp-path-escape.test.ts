/**
 * plugins/loading.md § Paths that escape the plugin directory: Claude Code "rejects a component
 * path that resolves outside the plugin root, whether the path is declared in `plugin.json` or in
 * a marketplace entry": a path that points outside as written, a symlink that leads outside the
 * plugin, and on macOS and Linux a path with a backslash. The `mcpServers` paths (a `.json` file,
 * a bundle) and the root `.mcp.json` are decided by `locate`, as every other component path.
 */
import { describe, expect, test } from 'bun:test';
import { collectMcpServers } from '../../src/entry/format.ts';
import { json } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const PLUGIN = '/m/plugins/meta';
const roots = { pluginRoot: PLUGIN, marketplaceRoot: '/m' };
const servers = json({ mcpServers: { evil: { command: 'evil' } } });

/** Every path the port was handed: none may be absolute or climb out of the folder. */
const touched = (files: ReturnType<typeof memoryFiles>): string[] =>
  files.accesses.map(({ path }) => path);

spec('install.loading.Paths that escape the plugin directory', () => {
  test('an absolute or backslash mcpServers path is rejected before any read', async () => {
    for (const written of ['/etc/mcp.json', './a\\..\\..\\mcp.json', '/etc/server.mcpb']) {
      const files = memoryFiles({});
      const read = await collectMcpServers(files, written);
      expect(read.servers).toEqual({});
      expect(read.issues.map(({ message }) => message)).toEqual([
        `mcpServers path escapes plugin directory: ${written}`,
      ]);
      expect(touched(files)).toEqual(['.mcp.json']);
    }
  });

  test('a declared .json file that is a symlink leading outside the plugin is rejected', async () => {
    const files = memoryFiles({ 'shared.json': { symlink: '/home/user/mcp.json' } });
    const read = await collectMcpServers(files, './shared.json', { roots });
    expect(read.servers).toEqual({});
    expect(read.issues.map(({ message }) => message)).toEqual([
      'mcpServers path escapes plugin directory: ./shared.json — it resolves to /home/user/mcp.json, outside the plugin directory',
    ]);
  });

  test('a path spelled .//x stays inside the plugin: it is read there, never as /x', async () => {
    const files = memoryFiles({ 'etc/mcp.json': servers });
    const read = await collectMcpServers(files, './/etc/mcp.json');
    expect(Object.keys(read.servers)).toEqual(['evil']);
    expect(touched(files).every((path) => !path.startsWith('/'))).toBe(true);
  });
});

describe('judgments: the root .mcp.json is one of the plugin own files', () => {
  test('a root .mcp.json that links outside is skipped and reported by its full path', async () => {
    const files = memoryFiles({ '.mcp.json': { symlink: '/home/user/mcp.json' } });
    const read = await collectMcpServers(files, undefined, { roots });
    expect(read.servers).toEqual({});
    expect(read.issues.map(({ message }) => message)).toEqual([
      `mcpServers path escapes plugin directory: ${PLUGIN}/.mcp.json — it resolves to /home/user/mcp.json, outside the plugin directory and its marketplace directory`,
    ]);
  });

  test('a root .mcp.json that links inside the plugin loads', async () => {
    const files = memoryFiles({
      '.mcp.json': { symlink: 'config/mcp.json' },
      'config/mcp.json': servers,
    });
    const read = await collectMcpServers(files, undefined, { roots });
    expect(read.issues).toEqual([]);
    expect(Object.keys(read.servers)).toEqual(['evil']);
  });
});
