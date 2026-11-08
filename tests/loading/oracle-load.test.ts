/**
 * What Claude Code 2.1.319 loads from a plugin folder where the docs are silent or say less
 * (E5a): each test builds the smallest folder of its own that shows one rule, and the same folder
 * was run through `claude --plugin-dir <dir> plugin details <name>` (spec/judgments.md,
 * "oracle 2.1.319"; docs/SPEC.md). Outside `spec(...)`: a judgment is never compatibility.
 *
 * plugins/create.md § Load a folder of plugins states the folder-of-plugins rule; the rest is the
 * oracle's: which hook and MCP failures keep a whole plugin from loading, that a skill folder
 * named twice loads once, that an unknown hook event is not loaded.
 */
import { describe, expect, test } from 'bun:test';
import { classifyPluginFolder, loadPlugin } from '../../src/index.ts';
import { json, namesOf } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';

const skillOf = (name: string) => `---\nname: ${name}\ndescription: d\n---\nbody\n`;
const skill = skillOf('x');
const handlers = [{ hooks: [{ type: 'command', command: 'x' }] }];
const load = (tree: Record<string, string>) =>
  loadPlugin({ files: memoryFiles(tree), fallbackName: 'plug' });
const hooks = (file: unknown) => load({ 'hooks/hooks.json': json(file) });
const kind = (tree: Record<string, string>) => classifyPluginFolder({ files: memoryFiles(tree) });

describe('a --plugin-dir folder is one plugin or a folder of plugins (plugins/create.md)', () => {
  test.each([
    ['an empty .claude-plugin folder', { '.claude-plugin/x': '' }],
    ['a manifest', { '.claude-plugin/plugin.json': '{}' }],
    [
      'a marketplace file beside a manifest',
      {
        '.claude-plugin/marketplace.json': '{}',
        '.claude-plugin/plugin.json': '{}',
      },
    ],
    ['skills/', { 'skills/a/SKILL.md': skill }],
    ['commands/', { 'commands/a.md': 'x' }],
    ['agents/', { 'agents/a.md': 'x' }],
    ['hooks/', { 'hooks/hooks.json': '{}' }],
    ['output-styles/', { 'output-styles/a.md': 'x' }],
    ['themes/', { 'themes/a.json': '{}' }],
    ['monitors/', { 'monitors/monitors.json': '[]' }],
    ['workflows/', { 'workflows/a.js': 'x' }],
    ['a root SKILL.md', { 'SKILL.md': skill }],
    ['.mcp.json', { '.mcp.json': '{}' }],
    ['.lsp.json', { '.lsp.json': '{}' }],
  ])('%s makes it one plugin', async (_label, tree) => {
    expect(await kind(tree)).toBe('plugin');
  });

  test.each([
    ['nothing', { 'README.md': 'x' }],
    ['only a marketplace file in .claude-plugin', { '.claude-plugin/marketplace.json': '{}' }],
    [
      'marketplace file and other files, no manifest',
      {
        '.claude-plugin/marketplace.json': '{}',
        '.claude-plugin/other.json': '{}',
      },
    ],
    [
      'bin/, settings.json, CLAUDE.md, a root hooks.json',
      {
        'bin/x': 'x',
        'settings.json': '{}',
        'CLAUDE.md': 'x',
        'hooks.json': '{}',
      },
    ],
    ['an empty .mcp.json', { '.mcp.json': '' }],
    ['a lower-case skill.md', { 'skill.md': skill }],
    ['a child plugin', { 'child/.claude-plugin/plugin.json': '{}' }],
  ])('%s makes it a folder of plugins', async (_label, tree) => {
    expect(await kind(tree)).toBe('folder-of-plugins');
  });
});

describe('a skill folder reached twice loads once', () => {
  test('a manifest path inside the default skills/ folder', async () => {
    const { plugin } = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', skills: ['./skills/a/'] }),
      'skills/a/SKILL.md': skillOf('a'),
      'skills/b/SKILL.md': skillOf('b'),
    });
    expect(namesOf(plugin?.skills ?? [])).toEqual(['a', 'b']);
  });

  test('keeps the name the default folder gave, not the frontmatter name of the direct path', async () => {
    const { plugin } = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', skills: ['./skills/a'] }),
      'skills/a/SKILL.md': skillOf('other-name'),
    });
    expect(namesOf(plugin?.skills ?? [])).toEqual(['a']);
  });

  test('the same path listed twice', async () => {
    const { plugin } = await load({
      '.claude-plugin/plugin.json': json({ name: 'plug', skills: ['./s/a/', './s/a'] }),
      's/a/SKILL.md': skillOf('a'),
    });
    expect(namesOf(plugin?.skills ?? [])).toEqual(['a']);
  });
});

describe('hook events', () => {
  test('an unknown event is not loaded', async () => {
    const { plugin } = await hooks({ hooks: { BeforeTool: handlers, Stop: handlers } });
    expect(Object.keys(plugin?.hooks ?? {})).toEqual(['Stop']);
  });

  test('an event whose entries all fail stays an empty list', async () => {
    const { plugin } = await hooks({ hooks: { Stop: [{ matcher: 5, hooks: [] }] } });
    expect(plugin?.hooks.Stop).toEqual([]);
  });
});

describe('a hooks file that keeps the whole plugin from loading', () => {
  test.each([
    ['a guard event that is not a list', { hooks: { PreToolUse: 5 } }],
    ['a guard group without handlers', { hooks: { PermissionRequest: [{ matcher: 'x' }] } }],
    [
      'a guard group with a matcher that is not text',
      { hooks: { PreToolUse: [{ matcher: 5, hooks: [] }] } },
    ],
    ['hooks that is a text', { hooks: 'x' }],
    ['hooks that is a list', { hooks: [] }],
    ['a guard event outside "hooks"', { PreToolUse: handlers }],
    [
      'a guard event outside "hooks" beside "hooks"',
      { hooks: { Stop: handlers }, PermissionRequest: handlers },
    ],
    ['a name that is no event, holding handlers, outside "hooks"', { zzz: handlers }],
    ['a lower-case guard name outside "hooks"', { pretooluse: handlers }],
  ])('%s', async (_label, file) => {
    const { plugin, issues } = await hooks(file);
    expect(plugin).toBeUndefined();
    expect(issues.some((found) => found.severity === 'error')).toBe(true);
  });

  test.each([
    ['a non-guard event that is not a list', { hooks: { Stop: 5 } }],
    [
      'a non-guard group with a matcher that is not text',
      { hooks: { Stop: [{ matcher: 5, hooks: [] }] } },
    ],
    ['a guard event that is empty or null', { hooks: { PreToolUse: [], Stop: null } }],
    ['hooks that is null', { hooks: null }],
    ['an event map without "hooks"', { Stop: handlers }],
    ['another known event outside "hooks"', { SessionStart: handlers }],
    ['a list of text outside "hooks"', { _comment: ['text'] }],
    ['an empty list outside "hooks"', { zzz: [], PreToolUse: [] }],
    ['a text or object outside "hooks"', { zzz: 'x', other: {} }],
    ['a top-level list', [1]],
  ])('%s loads the plugin', async (_label, file) => {
    const { plugin } = await hooks(file);
    expect(plugin).toBeDefined();
  });
});

describe('an inline mcpServers entry in the manifest', () => {
  const manifest = (server: unknown) =>
    load({ '.claude-plugin/plugin.json': json({ name: 'plug', mcpServers: { m: server } }) });

  test.each([
    ['empty', {}],
    ['a url without type', { url: 'http://x' }],
    ['of a type that is no transport', { type: 'url', url: 'http://x' }],
    ['an http server without url', { type: 'http' }],
    ['a command that is not text', { command: 5 }],
    ['not an object', 'x'],
  ])('%s keeps the plugin from loading', async (_label, server) => {
    expect((await manifest(server)).plugin).toBeUndefined();
  });

  test('a valid one loads', async () => {
    expect(Object.keys((await manifest({ command: 'x' })).plugin?.mcpServers ?? {})).toEqual(['m']);
  });

  test('the same entry in .mcp.json is dropped and the plugin still loads', async () => {
    const { plugin, issues } = await load({
      '.mcp.json': json({
        mcpServers: { m: { type: 'url', url: 'http://x' }, ok: { command: 'x' } },
      }),
    });
    expect(Object.keys(plugin?.mcpServers ?? {})).toEqual(['ok']);
    expect(issues.some((found) => found.message.includes('"m"'))).toBe(true);
  });
});

describe('the skill at the plugin root', () => {
  const root = (text: string) => load({ 'SKILL.md': text });

  test('is named by its frontmatter name, as written (skills.md, "How a skill gets its command name")', async () => {
    const { plugin } = await root('---\nname: Plan Review\ndescription: d\n---\nbody\n');
    expect(namesOf(plugin?.skills ?? [])).toEqual(['Plan Review']);
  });

  test('falls back to the plugin name without one', async () => {
    const { plugin } = await root('---\ndescription: d\n---\nbody\n');
    expect(namesOf(plugin?.skills ?? [])).toEqual(['plug']);
  });
});

describe('a skill folder named by a manifest path', () => {
  const named = (text: string) =>
    load({
      '.claude-plugin/plugin.json': json({ name: 'plug', skills: ['./only'] }),
      'only/SKILL.md': text,
      'skills/found/SKILL.md': '---\nname: Other Name\ndescription: d\n---\n',
    });

  test('is named by its frontmatter name, a folder found among a parent folder by its own name', async () => {
    const { plugin } = await named('---\nname: Plan Review\ndescription: d\n---\n');
    expect(namesOf(plugin?.skills ?? [])).toEqual(['found', 'Plan Review']);
  });

  test('falls back to its folder name', async () => {
    const { plugin } = await named('---\ndescription: d\n---\n');
    expect(namesOf(plugin?.skills ?? [])).toEqual(['found', 'only']);
  });

  test('a SKILL.md directly in the default skills/ folder is no skill', async () => {
    const { plugin } = await load({
      'skills/SKILL.md': skill,
      'skills/child/SKILL.md': skill,
    });
    expect(namesOf(plugin?.skills ?? [])).toEqual(['child']);
  });
});

describe('a file reached twice through a link inside the plugin loads once (oracle 2.1.319)', () => {
  // tests/fixtures/runtime/symlinked-duplicates: `agents/judge.agent.md -> judge.md` registers one
  // agent, `commands/y.md -> x.md` one command, `skills/alias -> real` one skill.
  const linked = {
    '.claude-plugin/plugin.json': '{ "name": "plug" }',
    'agents/judge.md': '---\nname: judge\ndescription: a\n---\nJudge.\n',
    'agents/judge.agent.md': { symlink: 'judge.md' },
    'commands/x.md': '---\ndescription: c\n---\nRun x.\n',
    'commands/y.md': { symlink: 'x.md' },
  } as const;

  // A linked skill folder is covered by the runtime fixture only: memoryFiles does not follow paths
  // below a linked directory.
  test('agents and commands keep the first name in folder order', async () => {
    const { plugin } = await loadPlugin({ files: memoryFiles(linked), fallbackName: 'plug' });
    expect(plugin?.agents.map((file) => file.name)).toEqual(['judge']);
    expect(plugin?.commands.map((file) => file.name)).toEqual(['x']);
  });

  test('two real files with the same content both load', async () => {
    const { plugin } = await loadPlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': '{ "name": "plug" }',
        'commands/x.md': 'Same.\n',
        'commands/y.md': 'Same.\n',
      }),
      fallbackName: 'plug',
    });
    expect(plugin?.commands.map((file) => file.name)).toEqual(['x', 'y']);
  });
});
