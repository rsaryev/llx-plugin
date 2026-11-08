/**
 * mcp.md § "Scope hierarchy and precedence": "When the same server is defined in more than one place,
 * Claude Code connects to it once, using the definition from the highest-precedence source. The entire
 * server entry from that source is used; fields are not merged across scopes." The order is local,
 * project, user, plugin-provided servers, claude.ai connectors. "Claude Code matches duplicates across
 * the three scopes by name. It matches plugins and connectors by endpoint, so one that points at the
 * same URL or command as an enabled server above counts as a duplicate." Two URL spellings are one
 * endpoint when they differ only in the case of scheme or host, the default port or a trailing slash;
 * "a different path, query string, userinfo, or non-default port makes two servers". A server the
 * organization provides through `managedMcpServers` "ranks above all of these".
 * managed-mcp.md § "Where `managedMcpServers` applies" (rank only; the entries' content is another
 * module's: the same-name rule across managed sources is tested in managed.test.ts) and
 * § "How provided servers load": "A provided server takes precedence over a server with
 * the same name in local, project, or user scope, and over a plugin server or claude.ai connector that
 * points at the same URL." mcp.md § "Use MCP servers from claude.ai": "`/mcp` lists the connector as
 * hidden" when a server you added points at the same URL.
 */
import { describe, expect, test } from 'bun:test';
import { MCP_SCOPES, rankMcpServers } from '../../../src/settings/mcp/index.ts';
import { spec } from '../../support/spec.ts';
import { candidate, http, labels, stdio } from '../../support/mcp-rank.ts';

spec('mcpSettings.behavior.Scope hierarchy and precedence', () => {
  test('the order is managed, local, project, user, plugin, claude.ai connector', () => {
    expect(MCP_SCOPES).toEqual(['managed', 'local', 'project', 'user', 'plugin', 'connector']);
  });

  test('one name in local, project and user loads once, from local', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('user', 'db', http('https://user.example.com/mcp')),
      candidate('project', 'db', http('https://project.example.com/mcp')),
      candidate('local', 'db', http('https://local.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['local:db']);
    expect(labels(hidden.map((each) => each.candidate))).toEqual(['project:db', 'user:db']);
  });

  test('project beats user when local does not define the name', () => {
    const { loaded } = rankMcpServers([
      candidate('user', 'db', stdio('user-db')),
      candidate('project', 'db', stdio('project-db')),
    ]);
    expect(labels(loaded)).toEqual(['project:db']);
  });

  test('the whole entry of the winner is used; fields are not merged across scopes', () => {
    const winner = { type: 'http', url: 'https://local.example.com/mcp' } as const;
    const { loaded } = rankMcpServers([
      candidate('user', 'api', {
        type: 'http',
        url: 'https://user.example.com/mcp',
        headers: { Authorization: 'Bearer user-token' },
      }),
      candidate('local', 'api', winner),
    ]);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.server).toEqual(winner);
    expect(loaded[0]?.server).not.toHaveProperty('headers');
  });

  test('different names are all loaded, even at the same endpoint, since the three scopes match by name', () => {
    const { loaded } = rankMcpServers([
      candidate('local', 'one', http('https://same.example.com/mcp')),
      candidate('user', 'two', http('https://same.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['local:one', 'user:two']);
  });

  test('a plugin server at the same URL as a server above it is a duplicate, whatever its name', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('plugin', 'plugin:docs:docs', http('https://mcp.example.com/mcp')),
      candidate('user', 'docs', http('https://mcp.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['user:docs']);
    expect(hidden[0]?.candidate.name).toBe('plugin:docs:docs');
    expect(hidden[0]?.duplicateOf.name).toBe('docs');
  });

  test('local and project servers that share a URL under different names both load, since the scopes match by name', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('local', 'one', http('https://same.example.com/mcp')),
      candidate('project', 'two', http('https://same.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['local:one', 'project:two']);
    expect(hidden).toEqual([]);
  });

  test('a connector at the command of a user stdio server is hidden', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('connector', 'claude.ai Tool', stdio('npx', '-y', 'tool')),
      candidate('user', 'tool', stdio('npx', '-y', 'tool')),
    ]);
    expect(labels(loaded)).toEqual(['user:tool']);
    expect(hidden[0]?.candidate.scope).toBe('connector');
  });

  test('a plugin stdio server at the command of a project or managed server is hidden', () => {
    for (const scope of ['project', 'managed'] as const) {
      const { loaded } = rankMcpServers([
        candidate('plugin', 'p', stdio('npx', '-y', 'tool')),
        candidate(scope, 'tool', stdio('npx', '-y', 'tool')),
      ]);
      expect(labels(loaded)).toEqual([`${scope}:tool`]);
    }
  });

  test('a plugin and a connector are matched by name never: the same name at another endpoint is no duplicate', () => {
    const { loaded } = rankMcpServers([
      candidate('user', 'docs', http('https://a.example.com/mcp')),
      candidate('plugin', 'docs', http('https://b.example.com/mcp')),
      candidate('connector', 'docs', http('https://c.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['user:docs', 'plugin:docs', 'connector:docs']);
  });

  test('a connector at the URL of a plugin server or of a user server is hidden', () => {
    const url = 'https://mcp.example.com/mcp';
    const byPlugin = rankMcpServers([
      candidate('connector', 'claude.ai Docs', http(url)),
      candidate('plugin', 'p', http(url)),
    ]);
    expect(labels(byPlugin.loaded)).toEqual(['plugin:p']);
    expect(byPlugin.hidden[0]?.candidate.scope).toBe('connector');
    const byUser = rankMcpServers([
      candidate('connector', 'claude.ai Docs', http(url)),
      candidate('user', 'mine', http(url)),
    ]);
    expect(labels(byUser.loaded)).toEqual(['user:mine']);
  });

  test('a plugin stdio server matches a user stdio server by command and arguments', () => {
    const { loaded } = rankMcpServers([
      candidate('plugin', 'p', stdio('npx', '-y', 'tool')),
      candidate('user', 'tool', stdio('npx', '-y', 'tool')),
      candidate('plugin', 'q', stdio('npx', '-y', 'other')),
    ]);
    expect(labels(loaded)).toEqual(['user:tool', 'plugin:q']);
  });

  test('URL spellings that differ in scheme or host case, the default port or a trailing slash are one endpoint', () => {
    for (const spelling of [
      'HTTPS://MCP.Example.com/mcp',
      'https://mcp.example.com:443/mcp',
      'https://mcp.example.com/mcp/',
    ]) {
      const { loaded } = rankMcpServers([
        candidate('user', 'a', http('https://mcp.example.com/mcp')),
        candidate('plugin', 'b', http(spelling)),
      ]);
      expect(labels(loaded)).toEqual(['user:a']);
    }
  });

  test('a different path, query string, userinfo or non-default port makes two servers', () => {
    for (const other of [
      'https://mcp.example.com/other',
      'https://mcp.example.com/mcp?team=a',
      'https://user:pw@mcp.example.com/mcp',
      'https://mcp.example.com:8443/mcp',
    ]) {
      const { loaded } = rankMcpServers([
        candidate('user', 'a', http('https://mcp.example.com/mcp')),
        candidate('plugin', 'b', http(other)),
      ]);
      expect(labels(loaded)).toEqual(['user:a', 'plugin:b']);
    }
  });

  test('a disabled server above does not count: a plugin at its endpoint still loads', () => {
    const { loaded } = rankMcpServers([
      candidate('user', 'mine', http('https://mcp.example.com/mcp'), false),
      candidate('plugin', 'p', http('https://mcp.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['user:mine', 'plugin:p']);
  });

  test('the result does not depend on the order the candidates were given', () => {
    const list = [
      candidate('connector', 'c', http('https://x.example.com/mcp')),
      candidate('plugin', 'p', http('https://x.example.com/mcp')),
      candidate('user', 'u', http('https://x.example.com/mcp')),
      candidate('project', 'u', http('https://y.example.com/mcp')),
    ];
    const forward = rankMcpServers(list);
    const backward = rankMcpServers(list.toReversed());
    // The user server lost its name to the project one, so it holds no endpoint: the plugin loads.
    expect(labels(forward.loaded)).toEqual(['project:u', 'plugin:p']);
    expect(labels(backward.loaded)).toEqual(labels(forward.loaded));
  });

  test('the Desktop app Code tab uses the user definition of a stdio server also written in .mcp.json', () => {
    const list = [
      candidate('project', 'tool', stdio('project-tool')),
      candidate('user', 'tool', stdio('user-tool')),
    ];
    expect(rankMcpServers(list).loaded[0]?.scope).toBe('project');
    expect(rankMcpServers(list, { desktopCodeTab: true }).loaded[0]?.scope).toBe('user');
  });

  test('the Desktop exception covers stdio servers only and never outranks local scope', () => {
    const remote = rankMcpServers(
      [
        candidate('project', 'r', http('https://p.example.com/mcp')),
        candidate('user', 'r', http('https://u.example.com/mcp')),
      ],
      { desktopCodeTab: true },
    );
    expect(remote.loaded[0]?.scope).toBe('project');
    const local = rankMcpServers(
      [
        candidate('user', 's', stdio('u')),
        candidate('project', 's', stdio('p')),
        candidate('local', 's', stdio('l')),
      ],
      { desktopCodeTab: true },
    );
    expect(local.loaded[0]?.scope).toBe('local');
  });
});

spec('mcpSettings.managed.How provided servers load', () => {
  test('a managed server ranks above local, project and user servers of the same name', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('local', 'search', http('https://local.example.com/mcp')),
      candidate('project', 'search', http('https://project.example.com/mcp')),
      candidate('user', 'search', http('https://user.example.com/mcp')),
      candidate('managed', 'search', http('https://search.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['managed:search']);
    expect(loaded[0]?.server).toEqual(http('https://search.example.com/mcp'));
    expect(hidden).toHaveLength(3);
  });

  test('a managed server hides a plugin server and a connector at the same URL', () => {
    const url = 'https://search.example.com/mcp';
    const { loaded } = rankMcpServers([
      candidate('connector', 'claude.ai Search', http(url)),
      candidate('plugin', 'p', http(url)),
      candidate('managed', 'search', http(url)),
    ]);
    expect(labels(loaded)).toEqual(['managed:search']);
  });

  test('a managed server under another name and at another URL hides no user server', () => {
    const { loaded, hidden } = rankMcpServers([
      candidate('user', 'mine', http('https://mine.example.com/mcp')),
      candidate('managed', 'search', http('https://search.example.com/mcp')),
    ]);
    expect(labels(loaded)).toEqual(['managed:search', 'user:mine']);
    expect(hidden).toEqual([]);
  });
});

describe('ranking judgments', () => {
  // Judgment (spec/judgments.md): the docs rank no two sources of one scope, nor say whether two plugin
  // servers at one endpoint are one server. "Connects to it once" is the stated principle, so the
  // first of equal rank wins and the other is hidden.
  test('two plugin servers at one endpoint load once, the first given', () => {
    const url = 'https://mcp.example.com/mcp';
    const { loaded } = rankMcpServers([
      candidate('plugin', 'first', http(url)),
      candidate('plugin', 'second', http(url)),
    ]);
    expect(labels(loaded)).toEqual(['plugin:first']);
  });

  // Judgment: servers of one name in one scope (the folder and its repository root both written in
  // ~/.claude.json) are one name: the first given wins.
  test('one name twice in one scope keeps the first given', () => {
    const { loaded } = rankMcpServers([
      candidate('local', 'db', stdio('first')),
      candidate('local', 'db', stdio('second')),
    ]);
    expect(loaded[0]?.server).toEqual(stdio('first'));
  });

  // Judgment: a disabled server still holds its name (the docs list it in /mcp "marked as disabled"),
  // so a lower scope of that name does not load in its place.
  test('a disabled server still shadows a lower scope of the same name', () => {
    const { loaded } = rankMcpServers([
      candidate('local', 'db', stdio('a'), false),
      candidate('user', 'db', stdio('b')),
    ]);
    expect(labels(loaded)).toEqual(['local:db']);
  });
});
