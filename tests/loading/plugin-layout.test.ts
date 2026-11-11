/**
 * plugins/create.md § Plugin layout (the table: `.claude-plugin/plugin.json`, `skills/`, `commands/`,
 * `agents/`, `hooks/hooks.json`, `.mcp.json`; "Only `plugin.json` goes inside `.claude-plugin/`.
 * Components saved there don't load. The plugin root is the plugin's own directory, not `~/.claude/`
 * itself. A `.mcp.json` saved at `~/.claude/.mcp.json` doesn't load"). Each test builds a plugin in
 * memory and calls the real `loadPlugin`.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import { probeFolder } from '../../src/loading/folder-plugin.ts';
import { memoryFiles } from '../support/ports.ts';
import { hooksFile, json, namesOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const MANIFEST = '.claude-plugin/plugin.json';
const load = (files: Parameters<typeof memoryFiles>[0], fallbackName?: string) =>
  loadPlugin({ files: memoryFiles(files), ...(fallbackName && { fallbackName }) });

spec('install.develop.Plugin layout..claude-plugin/plugin.json', () => {
  test('the manifest names the plugin', async () => {
    const loaded = await load({ [MANIFEST]: json({ name: 'my-first-plugin' }) });
    expect(loaded.plugin?.name).toBe('my-first-plugin');
    expect(loaded.plugin?.manifest?.name).toBe('my-first-plugin');
  });

  test('with --plugin-dir and no manifest, Claude Code names the plugin after its directory', async () => {
    const loaded = await load({ 'skills/hello/SKILL.md': 'Greet.' }, 'my-first-plugin');
    expect(loaded.plugin).toMatchObject({ name: 'my-first-plugin', manifest: undefined });
    const probed = await probeFolder(
      memoryFiles({ 'skills/hello/SKILL.md': 'Greet.' }),
      'my-first-plugin',
      'inline',
    );
    expect(probed.plugin?.name).toBe('my-first-plugin');
  });

  test('only plugin.json goes inside .claude-plugin/: components saved there do not load', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'misplaced' }),
      '.claude-plugin/skills/hello/SKILL.md': 'Greet.',
      '.claude-plugin/commands/about.md': 'About.',
      '.claude-plugin/agents/reviewer.md': 'Review.',
      '.claude-plugin/hooks/hooks.json': hooksFile('echo hi'),
      '.claude-plugin/.mcp.json': json({ mcpServers: { s: { command: 'x' } } }),
    });
    expect(loaded.plugin?.skills).toEqual([]);
    expect(loaded.plugin?.commands).toEqual([]);
    expect(loaded.plugin?.agents).toEqual([]);
    expect(loaded.plugin?.hooks).toEqual({});
    expect(loaded.plugin?.mcpServers).toEqual({});
  });
});

spec('install.develop.Plugin layout.skills/', () => {
  test('one <name>/SKILL.md directory per skill', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'my-tool' }),
      'skills/review/SKILL.md': 'Review.',
      'skills/deploy/SKILL.md': 'Deploy.',
      'skills/notes.md': 'Not a skill folder.',
    });
    expect(loaded.plugin?.skills.map((skill) => skill.qualifiedName)).toEqual([
      'my-tool:deploy',
      'my-tool:review',
    ]);
  });
});

spec('install.develop.Plugin layout.commands/', () => {
  test('flat Markdown files, the older form of skills', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'my-tool' }),
      'commands/status.md': 'Show status.',
      'commands/notes.txt': 'not a command',
    });
    expect(namesOf(loaded.plugin?.commands ?? [])).toEqual(['status']);
    expect(loaded.plugin?.commands[0]?.qualifiedName).toBe('my-tool:status');
  });
});

spec('install.develop.Plugin layout.agents/', () => {
  test('one Markdown file per subagent', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'my-tool' }),
      'agents/reviewer.md': 'You review code.',
      'agents/tester.md': 'You test code.',
    });
    expect(namesOf(loaded.plugin?.agents ?? [])).toEqual(['reviewer', 'tester']);
  });
});

spec('install.develop.Plugin layout.hooks/hooks.json', () => {
  test('a top-level "hooks" key whose value has the shape of hooks in a settings file', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'my-tool' }),
      'hooks/hooks.json': hooksFile('./format.sh'),
    });
    expect(loaded.plugin?.hooks).toEqual({
      PostToolUse: [
        { matcher: 'Write|Edit', hooks: [{ type: 'command', command: './format.sh' }] },
      ],
    });
  });
});

spec('install.develop.Plugin layout..mcp.json', () => {
  test('MCP server definitions at the plugin root', async () => {
    const loaded = await load({
      [MANIFEST]: json({ name: 'my-tool' }),
      '.mcp.json': json({ mcpServers: { db: { command: 'db-server' } } }),
    });
    expect(Object.keys(loaded.plugin?.mcpServers ?? {})).toEqual(['db']);
  });

  test('a .mcp.json at ~/.claude/.mcp.json does not load: ~/.claude/ is not a plugin root', async () => {
    const claudeHome = memoryFiles({ '.mcp.json': json({ mcpServers: { db: { command: 'x' } } }) });
    const probed = await probeFolder(claudeHome, '.claude', 'skills-dir');
    expect(probed.plugin).toBeUndefined();
    expect(probed.plainSkill).toBeUndefined();
  });
});
