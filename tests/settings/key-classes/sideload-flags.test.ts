/**
 * settings-reference.md § Settings index (the `disableSideloadFlags` row: "Reject the CLI flags that
 * sideload plugins, subagents, and MCP servers", Scope Managed) and § `disableSideloadFlags`;
 * plugins/troubleshooting.md (the `--plugin-dir` message, verbatim); agent-sdk/typescript.md
 * (the `addPlugins` message, verbatim).
 */
import { describe, expect, test } from 'bun:test';
import {
  addPluginsRefusal,
  sideloadVerdict,
  type SideloadFacts,
} from '../../../src/settings/managed/index.ts';
import { viewOf } from '../../support/key-classes.ts';
import { spec } from '../../support/spec.ts';

const NONE: SideloadFacts = {
  pluginDirs: [],
  pluginUrls: [],
  agents: false,
  mcpServers: [],
  pluginDirsVariable: [],
  cloud: false,
};
const on = viewOf(['managed', { disableSideloadFlags: true }]);
const off = viewOf(['managed', { disableSideloadFlags: false }]);
const message = (flag: string) =>
  `${flag} is disabled by your organization's managed settings (disableSideloadFlags)`;

spec('policy.key.disableSideloadFlags', () => {
  describe('Scope: Managed', () => {
    test('a user, project, local or --settings file that sets it rejects nothing', () => {
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        const view = viewOf([scope, { disableSideloadFlags: true }]);
        expect(sideloadVerdict(view, { ...NONE, pluginDirs: ['./p'] }).refusals).toEqual([]);
      }
    });
  });

  describe('true rejects --plugin-dir, --plugin-url, --agents and --mcp-config, naming each', () => {
    test('--plugin-dir with the message of the docs', () => {
      expect(sideloadVerdict(on, { ...NONE, pluginDirs: ['./p'] }).refusals).toEqual([
        message('--plugin-dir'),
      ]);
    });

    test('--plugin-url, --agents and --mcp-config', () => {
      expect(sideloadVerdict(on, { ...NONE, pluginUrls: ['https://x/p.zip'] }).refusals).toEqual([
        message('--plugin-url'),
      ]);
      expect(sideloadVerdict(on, { ...NONE, agents: true }).refusals).toEqual([
        message('--agents'),
      ]);
      expect(
        sideloadVerdict(on, { ...NONE, mcpServers: [{ name: 'a', type: 'stdio' }] }).refusals,
      ).toEqual([message('--mcp-config')]);
    });

    test('the error names every rejected flag', () => {
      const verdict = sideloadVerdict(on, { ...NONE, pluginDirs: ['./p'], agents: true });
      expect(verdict.refusals).toEqual([message('--plugin-dir'), message('--agents')]);
    });

    test('a session with none of the flags starts', () => {
      expect(sideloadVerdict(on, NONE)).toEqual({ refusals: [], droppedServers: [] });
    });

    test('a --mcp-config whose servers are all in-process sdk entries is still accepted', () => {
      const mcpServers = [
        { name: 'a', type: 'sdk' },
        { name: 'b', type: 'sdk' },
      ];
      expect(sideloadVerdict(on, { ...NONE, mcpServers }).refusals).toEqual([]);
      expect(
        sideloadVerdict(on, { ...NONE, mcpServers: [...mcpServers, { name: 'c', type: 'http' }] })
          .refusals,
      ).toEqual([message('--mcp-config')]);
    });
  });

  describe('false, or no key, accepts the flags', () => {
    for (const [name, view] of [
      ['false', off],
      ['unset', viewOf(['managed', { model: 'a' }])],
    ] as const) {
      test(name, () => {
        const facts = {
          ...NONE,
          pluginDirs: ['./p'],
          agents: true,
          mcpServers: [{ name: 'a', type: 'http' }],
        };
        expect(sideloadVerdict(view, facts)).toEqual({ refusals: [], droppedServers: [] });
        expect(addPluginsRefusal(view)).toBeUndefined();
      });
    }
  });

  describe('cloud sessions', () => {
    const servers = [
      { name: 'inproc', type: 'sdk' },
      { name: 'slack', type: 'http', claudeTagSlack: true },
      { name: 'delivered', type: 'http' },
      { name: 'local', type: 'stdio' },
    ];

    test('start, dropping every server-delivered --mcp-config entry except sdk entries and Claude Tag Slack tools', () => {
      const verdict = sideloadVerdict(on, { ...NONE, cloud: true, mcpServers: servers });
      expect(verdict.refusals).toEqual([]);
      expect(verdict.droppedServers).toEqual(['delivered', 'local']);
    });

    test('a cloud session still rejects a plugin folder flag', () => {
      expect(sideloadVerdict(on, { ...NONE, cloud: true, pluginDirs: ['./p'] }).refusals).toEqual([
        message('--plugin-dir'),
      ]);
    });

    test('nothing is dropped outside a cloud session, and nothing without the key', () => {
      expect(sideloadVerdict(on, { ...NONE, mcpServers: servers }).droppedServers).toEqual([]);
      expect(
        sideloadVerdict(off, { ...NONE, cloud: true, mcpServers: servers }).droppedServers,
      ).toEqual([]);
    });
  });

  describe('plugin folders from the other sources are rejected too', () => {
    test('CLAUDE_CODE_PLUGIN_DIRS naming a folder exits at startup with an error that names the variable and says to unset it', () => {
      const [refusal] = sideloadVerdict(on, { ...NONE, pluginDirsVariable: ['/opt/p'] }).refusals;
      expect(refusal).toContain('CLAUDE_CODE_PLUGIN_DIRS');
      expect(refusal).toContain('unset');
    });

    test('the Agent SDK addPlugins call fails with the message of the docs', () => {
      expect(addPluginsRefusal(on)).toBe(
        'reload_plugins add_plugins is disabled by managed settings (disableSideloadFlags)',
      );
    });
  });
});
