/**
 * plugins/manifest-reference.md § How entry fields combine with `plugin.json` ("`plugin.json` present,
 * `strict` unset or `true`: Claude Code loads the manifest and appends the entry's `commands`,
 * `agents`, `skills`, `outputStyles`, and `themes` to it. For `hooks`, the entry's matchers for an event
 * replace the manifest's matchers for that same event"; "When a marketplace entry whose `source` is the
 * marketplace root lists specific `skills` subdirectories, only those subdirectories load, and the
 * plugin's default `skills/` directory isn't scanned") and marketplace-reference.md § Strict mode:
 * `loadPlugin({ entry })` loads the plugin a marketplace entry installs, merged as the entry says.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import type { Plugin } from '../../src/loading/index.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import { json } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const skill = (name: string) => `---\nname: ${name}\ndescription: ${name}\n---\nBody`;

const TREE = {
  '.claude-plugin/plugin.json': json({ name: 'my-plugin', description: 'Own' }),
  'skills/own/SKILL.md': skill('own'),
  'extra/listed/SKILL.md': skill('listed'),
  'hooks/hooks.json': json({
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'from-file' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'stop-file' }] }],
    },
  }),
};

const load = (entry: Record<string, unknown>, tree: Record<string, string> = TREE) =>
  loadPlugin({ files: memoryFiles(tree), entry: loaded(rawEntry(entry)) });

const skillPaths = (plugin: Pick<Plugin, 'skills'> | undefined) =>
  plugin?.skills.map((file) => file.path);

spec('marketplace.entry.strict', () => {
  test("strict: the entry's skills are appended to the manifest's and the display fields outrank plugin.json", async () => {
    const { plugin } = await load({ skills: ['./extra/listed'], description: 'From entry' });
    expect(skillPaths(plugin)).toEqual(['skills/own/SKILL.md', 'extra/listed/SKILL.md']);
    expect(plugin?.manifest?.description).toBe('From entry');
  });

  test("strict: the entry's hooks for an event replace the hook file's for that event, other events keep theirs", async () => {
    const hooks = {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'from-entry' }] }],
    };
    const { plugin } = await load({ hooks });
    const commands = (event: string) =>
      (plugin?.hooks[event] ?? []).flatMap((group) =>
        group.hooks.map((hook) => ('command' in hook ? hook.command : '')),
      );
    expect(commands('PreToolUse')).toEqual(['from-entry']);
    expect(commands('Stop')).toEqual(['stop-file']);
  });

  test('strict false with components in both: the plugin does not load', async () => {
    const { plugin, issues } = await load({ strict: false, skills: ['./extra/listed'] });
    expect(plugin).toBeUndefined();
    expect(issues.map((found) => found.message)).toContain(
      'Plugin my-plugin has conflicting manifests: both plugin.json and marketplace entry specify components',
    );
  });

  test('no plugin.json: the entry is the manifest, its name the plugin name', async () => {
    const { '.claude-plugin/plugin.json': _manifest, ...bare } = TREE;
    const { plugin } = await load({ name: 'from-entry', version: '2.0.0' }, bare);
    expect(plugin?.name).toBe('from-entry');
    expect(plugin?.manifest?.version).toBe('2.0.0');
  });
});

describe('a root-source entry that lists skills', () => {
  test("only the listed skills load: the default skills/ directory isn't scanned", async () => {
    const { plugin } = await load({ source: '.', skills: ['./extra/listed'] });
    expect(skillPaths(plugin)).toEqual(['extra/listed/SKILL.md']);
  });
});

/**
 * marketplace-reference.md § How an entry combines with plugin.json ("No `plugin.json`: the entry is
 * the manifest regardless of `strict`. Every manifest field that the entry accepts applies, including
 * `mcpServers`, `lspServers`, `userConfig`, and `channels`"; "`plugin.json` present ... Entry
 * `mcpServers`, `lspServers`, `userConfig`, and `channels` don't apply"), § Strict mode (the table),
 * § Hooks in an entry. Claude Code merges at load and writes no merged `plugin.json` into the cache
 * (docs/API.md, "Loading"), so a host loads the cached copy with its entry, as here.
 */
describe('the whole strict-mode table at load', () => {
  const lsp = {
    typescript: {
      command: 'typescript-language-server',
      extensionToLanguage: { '.ts': 'typescript' },
    },
  };
  const mcp = { docs: { command: 'docs-server' } };
  const { '.claude-plugin/plugin.json': _own, ...bare } = TREE;

  spec('marketplace.entry.strict', () => {
    test('no plugin.json and strict false: the entry is the manifest, its lspServers and mcpServers apply', async () => {
      const { plugin, issues } = await load(
        { name: 'typescript-lsp', strict: false, lspServers: lsp, mcpServers: mcp },
        bare,
      );
      expect(issues.filter((found) => found.severity === 'error')).toEqual([]);
      expect(Object.keys(plugin?.lspServers ?? {})).toEqual(['typescript']);
      expect(Object.keys(plugin?.mcpServers ?? {})).toEqual(['docs']);
    });

    test("plugin.json present: the entry's lspServers and mcpServers do not apply", async () => {
      const { plugin } = await load({ lspServers: lsp, mcpServers: mcp });
      expect(plugin?.lspServers).toEqual({});
      expect(plugin?.mcpServers).toEqual({});
    });

    test('strict false with plugin.json and no entry components: plugin.json is the manifest', async () => {
      const { plugin } = await load({ strict: false, description: 'From entry' });
      expect(skillPaths(plugin)).toEqual(['skills/own/SKILL.md']);
      expect(plugin?.manifest?.description).toBe('From entry');
    });

    test("strict: the entry's commands are appended to plugin.json's", async () => {
      const own = json({ name: 'my-plugin', commands: ['./commands/own.md'] });
      const { plugin } = await load(
        { commands: ['./extra/run.md'] },
        {
          ...TREE,
          '.claude-plugin/plugin.json': own,
          'commands/own.md': 'Own',
          'extra/run.md': 'Run',
        },
      );
      expect(plugin?.commands.map((file) => file.path)).toEqual([
        'commands/own.md',
        'extra/run.md',
      ]);
    });
  });

  test('entry hooks written as a file path: an error, and the plugin loads without them', async () => {
    const { plugin, issues } = await load({ hooks: './hooks/extra.json' });
    expect(plugin).toBeDefined();
    expect(issues.map((found) => found.message).join('\n')).toContain(
      'not yet supported in a marketplace entry',
    );
  });
});
