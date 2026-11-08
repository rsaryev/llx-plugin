/**
 * plugins/manifest-reference.md § Manifest file ("The manifest is optional. Without it, Claude Code
 * loads the components it finds in the standard layout. The plugin name then comes from the marketplace
 * entry, or from the directory name when you load the plugin with `--plugin-dir`"), § Standard layout
 * (the `deploy-tools` tree), § hooks (the array example that merges a file and an inline hook with
 * `hooks/hooks.json`), § mcpServers and § lspServers (the default file loads first, a later name replaces
 * an earlier one), § monitors; plugins/components.md § Default settings ("`settings.json` applies and
 * the manifest's `settings` is ignored"), § Hooks; plugins/troubleshooting.md (`Failed to load hooks from
 * <path>: <reason>`).
 *
 * Each test builds a plugin folder in memory and calls the real `loadPlugin`.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { hooksFile, json, messagesOf, namesOf } from '../support/plugin-folder.ts';
import { node } from '../support/mcp-bundle.ts';
import { spec } from '../support/spec.ts';

/** The layout of the docs' `deploy-tools` example, every default location filled. */
const DEPLOY_TOOLS = {
  '.claude-plugin/plugin.json': json({ name: 'deploy-tools', version: '1.0.0' }),
  'skills/deploy/SKILL.md': 'Deploy it.',
  'commands/status.md': 'Show status.',
  'agents/reviewer.md': 'You review code.',
  'hooks/hooks.json': hooksFile('"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh"'),
  'monitors/monitors.json': json([
    {
      name: 'error-log',
      command: 'tail -F ./logs/error.log',
      description: 'Application error log',
    },
  ]),
  'output-styles/terse.md': 'Be terse.',
  'themes/dracula.json': json({ name: 'Dracula', base: 'dark' }),
  'workflows/release-audit.js': 'export default {}',
  'bin/deploy-tool': '#!/bin/bash',
  'scripts/format.sh': '#!/bin/bash',
  'settings.json': json({ agent: 'reviewer' }),
  '.mcp.json': json({ mcpServers: { db: node('db.js') } }),
  '.lsp.json': json({ go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } }),
};

const load = async (tree: Record<string, string>, fallbackName?: string) =>
  loadPlugin({ files: memoryFiles(tree), ...(fallbackName && { fallbackName }) });

describe('a plugin that uses every default location', () => {
  spec(
    [
      'layout.Skills',
      'layout.Commands',
      'layout.Agents',
      'layout.Hooks',
      'layout.MCP servers',
      'layout.LSP servers',
      'layout.Output styles',
      'layout.Workflows',
      'layout.Themes',
      'layout.Monitors',
      'layout.Executables',
      'layout.Settings',
      'layout.Manifest',
    ],
    () => {
      test('loadPlugin finds every component where the standard layout puts it', async () => {
        const { plugin, issues } = await load(DEPLOY_TOOLS);
        expect(issues).toEqual([]);
        expect(plugin?.name).toBe('deploy-tools');
        expect(plugin?.manifest?.version).toBe('1.0.0');
        expect(plugin?.skills.map((one) => [one.qualifiedName, one.text])).toEqual([
          ['deploy-tools:deploy', 'Deploy it.'],
        ]);
        expect(plugin?.commands.map((one) => one.qualifiedName)).toEqual(['deploy-tools:status']);
        expect(plugin?.agents.map((one) => one.qualifiedName)).toEqual(['deploy-tools:reviewer']);
        expect(Object.keys(plugin?.hooks ?? {})).toEqual(['PostToolUse']);
        expect(Object.keys(plugin?.mcpServers ?? {})).toEqual(['db']);
        expect(Object.keys(plugin?.lspServers ?? {})).toEqual(['go']);
        expect(plugin?.outputStyles.map((one) => one.qualifiedName)).toEqual([
          'deploy-tools:terse',
        ]);
        expect(plugin?.workflows.map((one) => one.path)).toEqual(['workflows/release-audit.js']);
        expect(plugin?.themes.map((one) => one.path)).toEqual(['themes/dracula.json']);
        expect(namesOf(plugin?.monitors ?? [])).toEqual(['error-log']);
        expect(plugin?.bin).toEqual(['bin/deploy-tool']);
        expect(plugin?.hasBin).toBe(true);
        expect(plugin?.settings).toEqual({ agent: 'reviewer' });
      });

      test('the same files in the wrong places load nothing', async () => {
        const moved = Object.fromEntries(
          Object.entries(DEPLOY_TOOLS).map(([path, text]) =>
            path.startsWith('.claude-plugin/') ? [path, text] : [`.claude-plugin/${path}`, text],
          ),
        );
        const { plugin } = await load(moved);
        expect(plugin?.skills).toEqual([]);
        expect(plugin?.commands).toEqual([]);
        expect(plugin?.hooks).toEqual({});
        expect(plugin?.mcpServers).toEqual({});
        expect(plugin?.lspServers).toEqual({});
        expect(plugin?.monitors).toEqual([]);
        expect(plugin?.hasBin).toBe(false);
        expect(plugin?.settings).toEqual({});
      });
    },
  );
});

spec('layout.Manifest', () => {
  test('a plugin without plugin.json loads: the name is the fallback, the manifest is undefined, the layout is still found', async () => {
    const { plugin, issues } = await load(
      { 'skills/review/SKILL.md': 'Review.', 'commands/status.md': 'Status.' },
      'formatter',
    );
    expect(issues).toEqual([]);
    expect(plugin?.name).toBe('formatter');
    expect(plugin?.manifest).toBeUndefined();
    expect(plugin?.skills.map((one) => one.qualifiedName)).toEqual(['formatter:review']);
    expect(plugin?.commands.map((one) => one.qualifiedName)).toEqual(['formatter:status']);
  });

  test('the manifest name wins over the fallback: components are namespaced under it', async () => {
    const { plugin } = await load(
      { '.claude-plugin/plugin.json': json({ name: 'deploy-tools' }), 'commands/a.md': 'A.' },
      'cache-dir-name',
    );
    expect(plugin?.name).toBe('deploy-tools');
    expect(plugin?.commands.map((one) => one.qualifiedName)).toEqual(['deploy-tools:a']);
  });

  test('a manifest that fails validation means the plugin does not load, whatever the layout holds', async () => {
    const { plugin, issues } = await load(
      {
        '.claude-plugin/plugin.json': json({ name: 'p', homepage: 'not a url' }),
        'commands/a.md': 'A.',
      },
      'p',
    );
    expect(plugin).toBeUndefined();
    expect(issues.some((found) => found.severity === 'error' && found.path === 'homepage')).toBe(
      true,
    );
  });

  test('a manifest that is not JSON does not load', async () => {
    const { plugin, issues } = await load({ '.claude-plugin/plugin.json': '{ nope' }, 'p');
    expect(plugin).toBeUndefined();
    expect(messagesOf(issues)[0]).toStartWith(
      '.claude-plugin/plugin.json could not be read as JSON',
    );
  });
});

describe('a plugin that cannot be named (judgment)', () => {
  test('no manifest and no fallback name is an error and no plugin, not a guess', async () => {
    const { plugin, issues } = await load({ 'commands/a.md': 'A.' });
    expect(plugin).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
  });

  test('a fallback name that no plugin may have does not load', async () => {
    const { plugin, issues } = await load({ 'commands/a.md': 'A.' }, 'my plugin');
    expect(plugin).toBeUndefined();
    expect(issues[0]?.path).toBe('name');
  });
});
