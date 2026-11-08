/**
 * mcp.md § "Disable a server without removing it": a toggle in `/mcp` is recorded "per project in
 * `~/.claude.json`, in one of two lists that cover disjoint sets of servers": `disabledMcpServers`,
 * "an opt-out list for user-configured servers, plugin servers, servers your organization provides
 * through managed settings, the claude.ai connectors Claude Code fetches itself, and built-in servers
 * that default to on" (a connector is written "under its display name, for example `claude.ai
 * Slack`"), and `enabledMcpServers`, "an opt-in list for built-in servers that default to off, such as
 * `computer-use`". "Claude Code consults exactly one of the two lists for each server, so neither list
 * overrides the other. If you add a regular server to `enabledMcpServers`, or a default-off built-in
 * server to `disabledMcpServers`, Claude Code ignores the entry." The two lists "are unrelated to
 * `enabledMcpjsonServers` and `disabledMcpjsonServers`".
 */
import { describe, expect, test } from 'bun:test';
import {
  applyToggles,
  claudeJsonServers,
  connectorDisplayName,
  rankMcpServers,
  readProjectToggles,
  serverEnabled,
  type ProjectToggles,
} from '../../../src/settings/mcp/index.ts';
import { spec } from '../../support/spec.ts';
import { candidate, http, labels } from '../../support/mcp-rank.ts';

const state = {
  projects: {
    '/work/app': {
      disabledMcpServers: ['stripe', 'claude.ai Slack', 'plugin-search', 'org-search', 'notes'],
      enabledMcpServers: ['computer-use'],
      enabledMcpjsonServers: ['not-a-toggle'],
    },
  },
};
const toggles = readProjectToggles(state, '/work/app');

spec('mcpSettings.behavior.Disable a server without removing it', () => {
  test('the two lists are read per project from ~/.claude.json', () => {
    expect(toggles).toEqual({
      disabledMcpServers: ['stripe', 'claude.ai Slack', 'plugin-search', 'org-search', 'notes'],
      enabledMcpServers: ['computer-use'],
    });
    expect(readProjectToggles(state, '/work/other')).toEqual({
      disabledMcpServers: [],
      enabledMcpServers: [],
    });
  });

  test('disabledMcpServers turns off configured, plugin, managed, connector and default-on built-in servers', () => {
    for (const [subject, name] of [
      ['user', 'stripe'],
      ['local', 'stripe'],
      ['project', 'stripe'],
      ['plugin', 'plugin-search'],
      ['managed', 'org-search'],
      ['connector', 'claude.ai Slack'],
      ['builtin', 'notes'],
    ] as const) {
      expect(serverEnabled(toggles, subject, name)).toBe(false);
    }
  });

  test('a server the lists do not name stays on', () => {
    expect(serverEnabled(toggles, 'user', 'other')).toBe(true);
    expect(serverEnabled(toggles, 'connector', 'claude.ai Linear')).toBe(true);
    expect(serverEnabled(toggles, 'builtin', 'memory')).toBe(true);
  });

  test('a connector is written under its display name, claude.ai Slack', () => {
    expect(connectorDisplayName('Slack')).toBe('claude.ai Slack');
    expect(connectorDisplayName('Claude Docs')).toBe('claude.ai Claude Docs');
    expect(serverEnabled(toggles, 'connector', connectorDisplayName('Slack'))).toBe(false);
    // The bare connector name is another entry.
    expect(serverEnabled(toggles, 'connector', 'Slack')).toBe(true);
  });

  test('a default-off built-in connects only when enabledMcpServers names it', () => {
    expect(serverEnabled(toggles, 'builtinDefaultOff', 'computer-use')).toBe(true);
    expect(serverEnabled(toggles, 'builtinDefaultOff', 'other-builtin')).toBe(false);
  });

  test('exactly one list is consulted: a regular server in enabledMcpServers is ignored', () => {
    const lists: ProjectToggles = {
      disabledMcpServers: ['stripe'],
      enabledMcpServers: ['stripe', 'hubspot'],
    };
    expect(serverEnabled(lists, 'user', 'stripe')).toBe(false);
    expect(serverEnabled(lists, 'user', 'hubspot')).toBe(true);
  });

  test('a default-off built-in in disabledMcpServers is ignored: only the opt-in list can turn it on', () => {
    const lists: ProjectToggles = {
      disabledMcpServers: ['computer-use'],
      enabledMcpServers: ['computer-use'],
    };
    expect(serverEnabled(lists, 'builtinDefaultOff', 'computer-use')).toBe(true);
    const onlyDisabled: ProjectToggles = {
      disabledMcpServers: ['computer-use'],
      enabledMcpServers: [],
    };
    expect(serverEnabled(onlyDisabled, 'builtinDefaultOff', 'computer-use')).toBe(false);
  });

  test('the enabledMcpjsonServers list of the same project entry is no toggle', () => {
    expect(serverEnabled(toggles, 'builtinDefaultOff', 'not-a-toggle')).toBe(false);
    expect(serverEnabled(toggles, 'user', 'not-a-toggle')).toBe(true);
  });

  test('a disabled server is still listed, marked disabled, and loses no configuration', () => {
    const own = {
      mcpServers: { stripe: { type: 'http', url: 'https://mcp.stripe.com' } },
      projects: { '/work/app': { disabledMcpServers: ['stripe'] } },
    };
    const { candidates } = claudeJsonServers(own, '/work/app');
    const marked = applyToggles(candidates, readProjectToggles(own, '/work/app'));
    expect(marked).toEqual([
      { scope: 'user', name: 'stripe', server: http('https://mcp.stripe.com'), enabled: false },
    ]);
    expect(labels(rankMcpServers(marked).loaded)).toEqual(['user:stripe']);
  });

  test('a toggle applies to the candidates of its scope kind: applyToggles marks each one', () => {
    const marked = applyToggles(
      [
        candidate('user', 'stripe', http('https://a.example.com')),
        candidate('plugin', 'plugin-search', http('https://b.example.com')),
        candidate('user', 'fine', http('https://c.example.com')),
      ],
      toggles,
    );
    expect(marked.map((each) => each.enabled)).toEqual([false, false, true]);
  });
});

describe('toggle judgments', () => {
  // Judgment (spec/judgments.md): the docs say "user-configured servers"; local and project servers are
  // servers a person configured and `/mcp` lists them, so they take the opt-out list as well.
  // A list that is no list of texts reads as empty, an entry that is no text is skipped: ~/.claude.json
  // is Claude Code's own file and the docs give no repair for it.
  test('an unreadable list holds nothing and an entry that is no text is skipped', () => {
    const odd = {
      projects: { '/p': { disabledMcpServers: 'stripe', enabledMcpServers: ['a', 1, null] } },
    };
    expect(readProjectToggles(odd, '/p')).toEqual({
      disabledMcpServers: [],
      enabledMcpServers: ['a'],
    });
    expect(readProjectToggles(undefined, '/p')).toEqual({
      disabledMcpServers: [],
      enabledMcpServers: [],
    });
  });
});
