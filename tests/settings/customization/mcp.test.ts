/**
 * settings-reference.md § `strictPluginOnlyCustomization.mcp` ("Claude Code stops loading MCP servers
 * from `~/.claude.json` and `.mcp.json`. It keeps loading `managed-mcp.json` servers, servers from
 * `managedMcpServers`, and MCP servers from plugins other than skills-directory plugins"), managed-mcp.md
 * § Choose how to control servers (the "Plugin servers only" row) and § Provided servers ("Provided
 * servers keep loading when `strictPluginOnlyCustomization` locks the `mcp` surface"), errors.md
 * § Cannot add MCP server when managed settings allow only plugin servers ("set ... to `true` or to a
 * list that includes `mcp`", the quoted message).
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_ONLY_SURFACES } from '../../../src/protocol/settings-keys.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import { spec } from '../../support/spec.ts';

const STOPPED = ['userConfig', 'projectFile'] as const;
const KEPT = ['managedFile', 'managedSettings', 'plugin'] as const;

const REFUSAL =
  "Cannot add MCP server: your organization's managed settings allow only MCP servers that plugins provide. Install a plugin that provides this server, or ask your administrator to make it available.";

spec('settings.key.strictPluginOnlyCustomization.mcp', () => {
  describe('with mcp locked', () => {
    const locked = customizationOf(locking(['mcp']));

    test.each(STOPPED)('servers from %s do not load', (origin) => {
      expect(locked.loads('mcp', origin)).toBe(false);
    });

    test.each(KEPT)('servers from %s keep loading', (origin) => {
      expect(locked.loads('mcp', origin)).toBe(true);
    });

    test('a server of a skills-directory plugin does not load', () => {
      expect(locked.loads('mcp', 'skillsDirPlugin')).toBe(false);
    });

    test('true locks the surface as the array does', () => {
      const all = customizationOf(locking(true));
      for (const origin of STOPPED) expect(all.loads('mcp', origin)).toBe(false);
      for (const origin of KEPT) expect(all.loads('mcp', origin)).toBe(true);
    });
  });

  describe('without the mcp lock', () => {
    test.each(PLUGIN_ONLY_SURFACES.filter((surface) => surface !== 'mcp'))(
      'locking only %s leaves .mcp.json and ~/.claude.json loading',
      (surface) => {
        const policy = customizationOf(locking([surface]));
        for (const origin of [...STOPPED, ...KEPT]) expect(policy.loads('mcp', origin)).toBe(true);
      },
    );
  });

  describe('claude mcp add', () => {
    test('is refused with the documented message when mcp is locked, by true or by a list with mcp', () => {
      expect(customizationOf(locking(true)).mcpAddRefusal).toBe(REFUSAL);
      expect(customizationOf(locking(['skills', 'mcp'])).mcpAddRefusal).toBe(REFUSAL);
    });

    test('is not refused when mcp is not locked: a server that would load may be saved', () => {
      expect(customizationOf([]).mcpAddRefusal).toBeUndefined();
      expect(customizationOf(locking(['skills', 'agents', 'hooks'])).mcpAddRefusal).toBeUndefined();
    });
  });
});
