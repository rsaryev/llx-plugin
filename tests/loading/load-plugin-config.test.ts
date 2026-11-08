/**
 * plugins/manifest-reference.md § hooks (the array example that merges a file and an inline hook with
 * `hooks/hooks.json`), § mcpServers and § lspServers (the default file loads first, a later name replaces
 * an earlier one), § monitors; plugins/troubleshooting.md (`Failed to load hooks from <path>: <reason>`).
 *
 * Each test builds a plugin folder in memory and calls the real `loadPlugin`.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { hooksFile, json, messagesOf, namesOf } from '../support/plugin-folder.ts';
import { node } from '../support/mcp-bundle.ts';
import { spec } from '../support/spec.ts';

const load = async (tree: Record<string, string>, fallbackName?: string) =>
  loadPlugin({ files: memoryFiles(tree), ...(fallbackName && { fallbackName }) });

spec('manifest.field.hooks', () => {
  test('the docs array example: a file and an inline hook merge with hooks/hooks.json, the default first', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({
        name: 'p',
        hooks: [
          './config/extra-hooks.json',
          {
            PostToolUse: [
              {
                matcher: 'Write|Edit',
                hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/format.sh' }],
              },
            ],
          },
        ],
      }),
      'hooks/hooks.json': hooksFile('default.sh'),
      'config/extra-hooks.json': json({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                { type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/check-command.sh' },
              ],
            },
          ],
        },
      }),
    });
    expect(issues).toEqual([]);
    const commands = (event: string) =>
      (plugin?.hooks[event] ?? []).flatMap((group) =>
        group.hooks.map((hook) => ('command' in hook ? hook.command : '')),
      );
    expect(commands('PostToolUse')).toEqual([
      'default.sh',
      '"${CLAUDE_PLUGIN_ROOT}"/scripts/format.sh',
    ]);
    expect(commands('PreToolUse')).toEqual(['"${CLAUDE_PLUGIN_ROOT}"/scripts/check-command.sh']);
  });

  test('a hooks file that fails does not load: "Failed to load hooks from <path>: <reason>", the rest of the plugin loads', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({ name: 'p' }),
      'hooks/hooks.json': json({ PostToolUse: [] }),
      'commands/a.md': 'A.',
    });
    expect(plugin?.hooks).toEqual({});
    expect(plugin?.commands).toHaveLength(1);
    expect(messagesOf(issues)).toEqual([
      expect.stringMatching(/^Failed to load hooks from hooks\/hooks\.json: /),
    ]);
  });

  test('a hooks file that is not JSON is reported the same way', async () => {
    const { issues } = await load({
      '.claude-plugin/plugin.json': json({ name: 'p' }),
      'hooks/hooks.json': '{',
    });
    expect(messagesOf(issues)[0]).toStartWith('Failed to load hooks from hooks/hooks.json: ');
  });
});

spec('manifest.field.mcpServers', () => {
  test('.mcp.json loads first, then each declared source in order; a later name replaces an earlier one', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({
        name: 'p',
        mcpServers: ['./mcp/servers.json', { api: node('inline.js') }],
      }),
      '.mcp.json': json({ mcpServers: { root: node('root.js'), shared: node('old.js') } }),
      'mcp/servers.json': json({ mcpServers: { shared: node('new.js') } }),
    });
    expect(issues).toEqual([]);
    expect(plugin?.mcpServers).toEqual({
      root: node('root.js'),
      shared: node('new.js'),
      api: node('inline.js'),
    });
  });
});

const go = (command: string) => ({ command, extensionToLanguage: { '.go': 'go' } });

spec('manifest.field.lspServers', () => {
  test('.lsp.json loads first, then each declared config in order; a later server name replaces an earlier one', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({
        name: 'p',
        lspServers: [
          './lsp/more.json',
          { rust: { command: 'rust-analyzer', extensionToLanguage: { '.rs': 'rust' } } },
        ],
      }),
      '.lsp.json': json({
        go: go('gopls-old'),
        py: { command: 'pyright', extensionToLanguage: { '.py': 'python' } },
      }),
      'lsp/more.json': json({ go: go('gopls') }),
    });
    expect(issues).toEqual([]);
    expect(Object.keys(plugin?.lspServers ?? {}).toSorted()).toEqual(['go', 'py', 'rust']);
    expect(plugin?.lspServers.go?.command).toBe('gopls');
  });

  test('an invalid entry skips the file it is in and only that file', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({ name: 'p', lspServers: './lsp/ok.json' }),
      '.lsp.json': json({ bad: { command: 'x y', extensionToLanguage: { '.x': 'x' } } }),
      'lsp/ok.json': json({ go: go('gopls') }),
    });
    expect(Object.keys(plugin?.lspServers ?? {})).toEqual(['go']);
    expect(issues).toEqual([
      {
        severity: 'error',
        path: '.lsp.json',
        message:
          'Invalid LSP server config for ".lsp.json": bad: command: must not contain spaces unless it starts with "/"; put arguments in "args"',
      },
    ]);
  });
});

const entry = (name: string) => ({ name, command: 'poll', description: name });

spec('manifest.field.experimental.monitors', () => {
  test('the declared file replaces monitors/monitors.json; the inline array loads', async () => {
    const fromFile = await load({
      '.claude-plugin/plugin.json': json({ name: 'p', experimental: { monitors: './m.json' } }),
      'monitors/monitors.json': json([entry('default')]),
      'm.json': json([entry('declared')]),
    });
    expect(namesOf(fromFile.plugin?.monitors ?? [])).toEqual(['declared']);
    const inline = await load({
      '.claude-plugin/plugin.json': json({
        name: 'p',
        experimental: { monitors: [entry('inline')] },
      }),
    });
    expect(namesOf(inline.plugin?.monitors ?? [])).toEqual(['inline']);
  });

  test('a top-level monitors key still loads', async () => {
    const { plugin, issues } = await load({
      '.claude-plugin/plugin.json': json({
        name: 'p',
        monitors: [{ name: 'old', command: 'poll', description: 'Old' }],
      }),
    });
    expect(namesOf(plugin?.monitors ?? [])).toEqual(['old']);
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
  });

  test('an unknown key in a monitor entry is an error; the monitor is not loaded', async () => {
    const { plugin, issues } = await load(
      {
        'monitors/monitors.json': json([
          { name: 'a', command: 'c', description: 'd', extra: true },
        ]),
      },
      'p',
    );
    expect(plugin?.monitors).toEqual([]);
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'monitors/monitors.json[0]',
        message: 'Invalid monitor at monitors/monitors.json[0]: Unrecognized key: "extra"',
      },
    ]);
  });

  test('a valid sibling entry in the same file still loads when one entry is rejected (judgment: each entry stands alone)', async () => {
    const { plugin, issues } = await load(
      {
        'monitors/monitors.json': json([
          { name: 'a', command: 'c', description: 'd', extra: true },
          entry('b'),
        ]),
      },
      'p',
    );
    expect(namesOf(plugin?.monitors ?? [])).toEqual(['b']);
    expect(issues.map((found) => found.path)).toEqual(['monitors/monitors.json[0]']);
  });
});
