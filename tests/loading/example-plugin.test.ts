/**
 * plugins/components.md § Explore the plugin directory: the example plugin `my-plugin` "has one of
 * every kind of component in its default location": a review skill and an `about` command, a
 * security-review subagent, a formatting hook and its `scripts/` folder, a log monitor, an output style
 * and a color theme, a route-audit workflow, a `hello-plugin` executable, default settings, a local MCP
 * server and a Go language server. Loaded from nothing but default locations, every kind is found.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { json, namesOf } from './../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const SKILL = '---\nname: review\ndescription: Review code for bugs\n---\nReview the diff.';
const AGENT =
  '---\nname: security-review\ndescription: Reviews code for security issues\n---\nLook.';
const COMMAND = '---\ndescription: About this plugin\n---\nExplain the plugin.';
const STYLE = '---\nname: Terse\ndescription: Short answers\n---\nBe brief.';
const WORKFLOW =
  "export const meta = { name: 'route-audit', description: 'Audit routes' };\nexport default async () => {};";

const tree = {
  '.claude-plugin/plugin.json': json({
    name: 'my-plugin',
    description: 'Everything in one place',
    version: '1.0.0',
  }),
  'skills/review/SKILL.md': SKILL,
  'commands/about.md': COMMAND,
  'agents/security-review.md': AGENT,
  'hooks/hooks.json': json({
    hooks: {
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/scripts/format.sh' }],
        },
      ],
    },
  }),
  'scripts/format.sh': '#!/bin/bash\nexit 0',
  'monitors/monitors.json': json([
    {
      name: 'error-log',
      command: 'tail -F ./logs/error.log',
      description: 'Application error log',
    },
  ]),
  'output-styles/terse.md': STYLE,
  'themes/dracula.json': json({ name: 'Dracula', base: 'dark', overrides: {} }),
  'workflows/route-audit.js': WORKFLOW,
  'bin/hello-plugin': '#!/bin/bash\necho "hello from my-plugin"',
  'settings.json': json({ agent: 'security-review' }),
  '.mcp.json': json({ mcpServers: { db: { command: 'node', args: ['server.js'] } } }),
  '.lsp.json': json({
    go: { command: 'gopls', args: ['serve'], extensionToLanguage: { '.go': 'go' } },
  }),
};

spec('layout.components.Explore the plugin directory', () => {
  test('a plugin with a file in each default location has every kind of component', async () => {
    const loaded = await loadPlugin({ files: memoryFiles(tree) });
    const plugin = loaded.plugin;
    expect(plugin?.name).toBe('my-plugin');
    expect(namesOf(plugin?.skills ?? [])).toEqual(['review']);
    expect(namesOf(plugin?.commands ?? [])).toEqual(['about']);
    expect(namesOf(plugin?.agents ?? [])).toEqual(['security-review']);
    expect(Object.keys(plugin?.hooks ?? {})).toEqual(['PostToolUse']);
    expect(plugin?.monitors.map((monitor) => monitor.name)).toEqual(['error-log']);
    expect(namesOf(plugin?.outputStyles ?? [])).toEqual(['terse']);
    expect(namesOf(plugin?.themes ?? [])).toEqual(['dracula']);
    expect(namesOf(plugin?.workflows ?? [])).toEqual(['route-audit']);
    expect(plugin?.bin).toEqual(['bin/hello-plugin']);
    expect(plugin?.settings).toEqual({ agent: 'security-review' });
    expect(Object.keys(plugin?.mcpServers ?? {})).toEqual(['db']);
    expect(Object.keys(plugin?.lspServers ?? {})).toEqual(['go']);
  });
});
