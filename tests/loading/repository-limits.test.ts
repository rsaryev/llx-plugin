/**
 * plugins/loading.md § Trust check and component limits for repository plugins: "MCP servers it
 * declares go through the same per-server approval as a project `.mcp.json`"; "MCP servers it
 * declares as an MCP bundle, a `.mcpb` or `.dxt` file, or from a file outside the plugin directory
 * are skipped. Declare them inline or in a `.mcp.json` inside the plugin directory"; "Background
 * monitors do not load"; "Neither the trust check nor these component limits apply to a plugin under
 * your own `~/.claude/skills/`". Each test calls the real `loadPlugin` over an in-memory plugin.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin, type LoadPluginInput } from '../../src/loading/index.ts';
import {
  COMPONENT_LIMITS,
  limitRepositoryPlugin,
  loadRepositoryPlugin,
  repositoryLoadInput,
} from '../../src/loading/repository-limits.ts';
import { COMPONENT_KINDS } from '../../src/format/layout.ts';
import { fakeBundles, bundle } from '../support/mcp-bundle.ts';
import { memoryFiles } from '../support/ports.ts';
import { json, messagesOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const MONITORS = json([
  { name: 'error-log', command: 'tail -F ./logs/error.log', description: 'Application error log' },
]);
const manifest = (extra: Record<string, unknown> = {}) => json({ name: 'repo-plugin', ...extra });

const loadWith = (files: Parameters<typeof memoryFiles>[0], input: Partial<LoadPluginInput> = {}) =>
  loadRepositoryPlugin({ files: memoryFiles(files), ...input }, 'skills-dir');

spec('trust.loading.Trust check and component limits for repository plugins', () => {
  describe('MCP servers go through the per-server approval of a project .mcp.json', () => {
    test('the servers of .mcp.json and of an inline map both wait for approval', async () => {
      const loaded = await loadWith({
        '.claude-plugin/plugin.json': manifest({
          mcpServers: { inline: { command: 'inline-server' } },
        }),
        '.mcp.json': json({ mcpServers: { filed: { command: 'filed-server' } } }),
      });
      expect(Object.keys(loaded.plugin?.mcpServers ?? {}).toSorted()).toEqual(['filed', 'inline']);
      expect([...loaded.approvals].toSorted()).toEqual(['filed', 'inline']);
    });

    test('a plugin without servers asks for no approval', async () => {
      const loaded = await loadWith({ '.claude-plugin/plugin.json': manifest() });
      expect(loaded.approvals).toEqual([]);
    });
  });

  describe('MCP bundles and servers from outside the plugin directory are skipped', () => {
    test('a .mcpb or .dxt bundle and a bundle URL load nothing, even when the host could open them', async () => {
      const bundles = fakeBundles({
        'server.mcpb': bundle('packed'),
        'server.dxt': bundle('dxt-packed'),
        'https://example.com/remote.mcpb': bundle('remote'),
      });
      const loaded = await loadWith(
        {
          '.claude-plugin/plugin.json': manifest({
            mcpServers: ['./server.mcpb', './server.dxt', 'https://example.com/remote.mcpb'],
          }),
          'server.mcpb': 'archive',
          'server.dxt': 'archive',
        },
        { bundles },
      );
      expect(loaded.plugin?.mcpServers).toEqual({});
      expect(bundles.opens).toEqual([]);
      expect(messagesOf(loaded.issues)).toEqual([
        expect.stringContaining('MCP bundle ./server.mcpb could not be opened'),
        expect.stringContaining('MCP bundle ./server.dxt could not be opened'),
        expect.stringContaining('MCP bundle https://example.com/remote.mcpb could not be opened'),
      ]);
    });

    test('the same plugin loads its bundle when it is not repository-supplied', async () => {
      const files = {
        '.claude-plugin/plugin.json': manifest({ mcpServers: './server.mcpb' }),
        'server.mcpb': 'archive',
      };
      const bundles = fakeBundles({ 'server.mcpb': bundle('packed') });
      const loaded = await loadPlugin({ files: memoryFiles(files), bundles });
      expect(Object.keys(loaded.plugin?.mcpServers ?? {})).toEqual(['packed']);
    });

    test('a server file that resolves outside the plugin directory is skipped, inline and .mcp.json servers load', async () => {
      const loaded = await loadWith({
        '.claude-plugin/plugin.json': manifest({
          mcpServers: ['./shared.json', { inline: { command: 'inline-server' } }],
        }),
        'shared.json': { symlink: '../shared/mcp.json' },
        '.mcp.json': json({ mcpServers: { filed: { command: 'filed-server' } } }),
      });
      expect(Object.keys(loaded.plugin?.mcpServers ?? {}).toSorted()).toEqual(['filed', 'inline']);
      expect(messagesOf(loaded.issues)).toEqual([
        'mcpServers path escapes plugin directory: ./shared.json — it resolves to ../shared/mcp.json, outside the plugin directory',
      ]);
    });

    test('a declared path with .. names a file outside the directory: the manifest is refused', async () => {
      const loaded = await loadWith({
        '.claude-plugin/plugin.json': manifest({ mcpServers: '../shared/mcp.json' }),
      });
      expect(loaded.plugin).toBeUndefined();
      expect(messagesOf(loaded.issues)).toEqual([
        'Path contains ".." which could be a path traversal attempt',
      ]);
    });

    test('a .json file inside the plugin directory loads', async () => {
      const loaded = await loadWith({
        '.claude-plugin/plugin.json': manifest({ mcpServers: './servers/own.json' }),
        'servers/own.json': json({ mcpServers: { own: { command: 'own-server' } } }),
      });
      expect(Object.keys(loaded.plugin?.mcpServers ?? {})).toEqual(['own']);
      expect(loaded.approvals).toEqual(['own']);
    });
  });

  describe('background monitors do not load', () => {
    test('a default or declared monitors file loads nothing and says so', async () => {
      const loaded = await loadWith({
        '.claude-plugin/plugin.json': manifest(),
        'monitors/monitors.json': MONITORS,
      });
      expect(loaded.plugin?.monitors).toEqual([]);
      expect(loaded.issues).toContainEqual({
        severity: 'warning',
        path: 'monitors',
        message: 'Background monitors do not load from a repository plugin',
      });
    });

    test('a plugin without monitors gets no notice', async () => {
      const loaded = await loadWith({ '.claude-plugin/plugin.json': manifest() });
      expect(messagesOf(loaded.issues)).toEqual([]);
    });
  });

  describe('a plugin under your own ~/.claude/skills/ is not limited', () => {
    test('monitors and servers come through as loaded and ask for nothing', async () => {
      const plain = await loadPlugin({
        files: memoryFiles({
          '.claude-plugin/plugin.json': manifest(),
          'monitors/monitors.json': MONITORS,
          '.mcp.json': json({ mcpServers: { filed: { command: 'filed-server' } } }),
        }),
      });
      const limited = limitRepositoryPlugin(plain, 'user-skills-dir');
      expect(limited.plugin).toBe(plain.plugin);
      expect(limited.issues).toEqual(plain.issues);
      expect(limited.approvals).toEqual([]);
    });

    test("its load input keeps the host's bundle reader", () => {
      const bundles = fakeBundles({});
      const input: LoadPluginInput = { files: memoryFiles(), bundles };
      expect(repositoryLoadInput(input, 'user-skills-dir')).toBe(input);
      expect(repositoryLoadInput(input, 'skills-dir').bundles).not.toBe(bundles);
    });
  });

  test('a marketplace plugin of project scope is limited like a skills-directory one', async () => {
    const loaded = await loadRepositoryPlugin(
      {
        files: memoryFiles({
          '.claude-plugin/plugin.json': manifest(),
          'monitors/monitors.json': MONITORS,
        }),
      },
      'marketplace-project-scope',
    );
    expect(loaded.plugin?.monitors).toEqual([]);
  });
});

describe('component limits registry (judgment: only the documented components are limited)', () => {
  test('every component kind has a limit, and only monitors and MCP servers do anything', async () => {
    expect(Object.keys(COMPONENT_LIMITS).toSorted()).toEqual([...COMPONENT_KINDS].toSorted());
    const loaded = await loadPlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': manifest(),
        'skills/review/SKILL.md': 'Review.',
        'agents/reviewer.md': 'You review.',
        'hooks/hooks.json': json({ hooks: {} }),
      }),
    });
    const limited = limitRepositoryPlugin(loaded, 'skills-dir');
    expect(limited.plugin).toEqual(loaded.plugin);
    expect(limited.issues).toEqual(loaded.issues);
  });
});
