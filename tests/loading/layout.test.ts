/**
 * plugins/manifest-reference.md § Standard layout: each component type has one default location
 * and contents ("One `<name>/SKILL.md` per skill", "Flat Markdown command files", "Subfolders are
 * part of the agent name", "Workflow `.js` files", "Theme JSON files", "Files here are on the Bash
 * tool's `PATH`", "`agent` and `subagentStatusLine` defaults"). One block per row: the component is
 * found at its location, not at another, and a file that is not what the row says is not loaded.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { hooksFile, json, namesOf } from '../support/plugin-folder.ts';
import { node } from '../support/mcp-bundle.ts';
import { spec } from '../support/spec.ts';

type Tree = Record<string, string>;

const load = async (tree: Tree) =>
  (await loadPlugin({ files: memoryFiles(tree), fallbackName: 'p' })).plugin;

/** Moves every file of `tree` under `.claude-plugin/`, where no component is looked for. */
const misplaced = (tree: Tree): Tree =>
  Object.fromEntries(Object.entries(tree).map(([path, text]) => [`.claude-plugin/${path}`, text]));

const SKILL: Tree = { 'skills/deploy/SKILL.md': 'Deploy it.' };
const COMMAND: Tree = { 'commands/status.md': 'Show status.' };
const AGENT: Tree = { 'agents/reviewer.md': 'You review code.' };
const MCP: Tree = { '.mcp.json': json({ mcpServers: { db: node('db.js') } }) };
const LSP: Tree = {
  '.lsp.json': json({ go: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } }),
};
const MONITORS: Tree = {
  'monitors/monitors.json': json([
    {
      name: 'error-log',
      command: 'tail -F ./logs/error.log',
      description: 'Application error log',
    },
  ]),
};
const SETTINGS = {
  agent: 'reviewer',
  subagentStatusLine: { type: 'command' as const, command: 'echo' },
};

spec('layout.Skills', () => {
  test('a skill is skills/<name>/SKILL.md, found there and nowhere else', async () => {
    expect((await load(SKILL))?.skills.map((one) => one.qualifiedName)).toEqual(['p:deploy']);
    expect((await load(misplaced(SKILL)))?.skills).toEqual([]);
  });

  test('a flat skills/<name>.md is not a skill', async () => {
    expect((await load({ 'skills/deploy.md': 'Deploy it.' }))?.skills).toEqual([]);
  });

  test('a SKILL.md at the root with no skills/ loads as a single skill, and skills/ takes over when present', async () => {
    expect((await load({ 'SKILL.md': 'Root.' }))?.skills.map((one) => one.qualifiedName)).toEqual([
      'p:p',
    ]);
    const both = await load({ 'SKILL.md': 'Root.', ...SKILL });
    expect(both?.skills.map((one) => one.qualifiedName)).toEqual(['p:deploy']);
  });
});

spec('layout.Commands', () => {
  test('a command is a Markdown file in commands/, found there and nowhere else', async () => {
    expect((await load(COMMAND))?.commands.map((one) => one.qualifiedName)).toEqual(['p:status']);
    expect((await load(misplaced(COMMAND)))?.commands).toEqual([]);
  });

  test('a file that is not Markdown is not a command', async () => {
    expect((await load({ 'commands/status.txt': 'Show status.' }))?.commands).toEqual([]);
  });
});

spec('layout.Agents', () => {
  test('an agent is a Markdown file in agents/, found there and nowhere else', async () => {
    expect((await load(AGENT))?.agents.map((one) => one.qualifiedName)).toEqual(['p:reviewer']);
    expect((await load(misplaced(AGENT)))?.agents).toEqual([]);
  });

  test('a subfolder is part of the agent name', async () => {
    const plugin = await load({ 'agents/team/reviewer.md': 'You review code.' });
    expect(plugin?.agents.map((one) => one.qualifiedName)).toEqual(['p:team:reviewer']);
  });
});

spec('layout.Hooks', () => {
  test('hooks are hooks/hooks.json, read there and not from another file or place', async () => {
    const here: Tree = { 'hooks/hooks.json': hooksFile('echo one') };
    expect(Object.keys((await load(here))?.hooks ?? {})).toEqual(['PostToolUse']);
    expect((await load(misplaced(here)))?.hooks).toEqual({});
    expect((await load({ 'hooks/other.json': hooksFile('echo one') }))?.hooks).toEqual({});
  });
});

spec('layout.MCP servers', () => {
  test('MCP servers are .mcp.json at the root, read there and nowhere else', async () => {
    expect(Object.keys((await load(MCP))?.mcpServers ?? {})).toEqual(['db']);
    expect((await load(misplaced(MCP)))?.mcpServers).toEqual({});
    expect((await load({ 'mcp.json': MCP['.mcp.json'] ?? '' }))?.mcpServers).toEqual({});
  });
});

spec('layout.LSP servers', () => {
  test('LSP servers are .lsp.json at the root, read there and nowhere else', async () => {
    expect(Object.keys((await load(LSP))?.lspServers ?? {})).toEqual(['go']);
    expect((await load(misplaced(LSP)))?.lspServers).toEqual({});
    expect((await load({ 'lsp.json': LSP['.lsp.json'] ?? '' }))?.lspServers).toEqual({});
  });
});

spec('layout.Output styles', () => {
  test('an output style is a Markdown file in output-styles/, found there and nowhere else', async () => {
    const here: Tree = { 'output-styles/terse.md': 'Be terse.' };
    const plugin = await load({ ...here, 'output-styles/notes.txt': 'Not a style.' });
    expect(plugin?.outputStyles.map((one) => one.qualifiedName)).toEqual(['p:terse']);
    expect((await load(misplaced(here)))?.outputStyles).toEqual([]);
  });
});

spec('layout.Workflows', () => {
  test('a workflow is a .js file in workflows/, found there and nowhere else', async () => {
    const here: Tree = { 'workflows/release-audit.js': 'export default {}' };
    const plugin = await load({ ...here, 'workflows/notes.md': 'Not a workflow.' });
    expect(plugin?.workflows.map((one) => one.path)).toEqual(['workflows/release-audit.js']);
    expect((await load(misplaced(here)))?.workflows).toEqual([]);
  });
});

spec('layout.Themes', () => {
  test('a theme is a JSON file in themes/, found there and nowhere else', async () => {
    const here: Tree = { 'themes/dracula.json': json({ name: 'Dracula', base: 'dark' }) };
    const plugin = await load({ ...here, 'themes/notes.md': 'Not a theme.' });
    expect(plugin?.themes.map((one) => one.path)).toEqual(['themes/dracula.json']);
    expect((await load(misplaced(here)))?.themes).toEqual([]);
  });
});

spec('layout.Monitors', () => {
  test('monitors are monitors/monitors.json, read there and not from another file or place', async () => {
    expect(namesOf((await load(MONITORS))?.monitors ?? [])).toEqual(['error-log']);
    expect((await load(misplaced(MONITORS)))?.monitors).toEqual([]);
    const other = { 'monitors/other.json': MONITORS['monitors/monitors.json'] ?? '' };
    expect((await load(other))?.monitors).toEqual([]);
  });
});

spec('layout.Executables', () => {
  test('every file in bin/ is an executable, and a plugin without bin/ has none', async () => {
    const plugin = await load({ 'bin/deploy-tool': '#!/bin/bash', 'bin/lint': '#!/bin/bash' });
    expect(plugin?.bin).toEqual(['bin/deploy-tool', 'bin/lint']);
    expect(plugin?.hasBin).toBe(true);
    const none = await load({ 'scripts/format.sh': '#!/bin/bash' });
    expect(none?.bin).toEqual([]);
    expect(none?.hasBin).toBe(false);
    expect((await load({ '.claude-plugin/bin/deploy-tool': '#!/bin/bash' }))?.hasBin).toBe(false);
  });
});

spec('layout.Settings', () => {
  test('settings.json at the root gives the agent and subagentStatusLine defaults, and nothing else applies', async () => {
    const here: Tree = { 'settings.json': json(SETTINGS) };
    expect((await load(here))?.settings).toEqual(SETTINGS);
    expect((await load(misplaced(here)))?.settings).toEqual({});
    const extra: Tree = {
      'settings.json': json({ ...SETTINGS, permissions: { allow: ['Bash'] } }),
    };
    expect((await load(extra))?.settings).toEqual(SETTINGS);
  });
});

spec('layout.Manifest', () => {
  test('the manifest is .claude-plugin/plugin.json: its name names the plugin, a plugin.json elsewhere is not read', async () => {
    const manifest = json({ name: 'deploy-tools', version: '1.0.0' });
    const found = await loadPlugin({
      files: memoryFiles({ '.claude-plugin/plugin.json': manifest }),
    });
    expect(found.plugin?.name).toBe('deploy-tools');
    expect(found.plugin?.manifest?.version).toBe('1.0.0');
    const root = await loadPlugin({ files: memoryFiles({ 'plugin.json': manifest }) });
    expect(root.plugin).toBeUndefined();
  });
});
