/**
 * managed-mcp.md § "What an entry can contain": "Claude Code loads an entry only when it passes every
 * check below. It drops an entry that fails one, records a notice you can read with `/status`, and
 * still loads the other entries": `type` is `http` or `sse` (`streamable-http` is an alias of
 * `http`); `url` is an `https://` URL, "a plain `http://` URL, including one that points at
 * `localhost`" is refused; no `command`, `args`, `env` or `headersHelper` member; no `${VAR}`
 * reference in any value; the name holds "only letters, numbers, hyphens, and underscores", and "no
 * key or value contains control or invisible formatting characters"; the array form of Claude
 * Desktop "isn't accepted" and "records a notice instead of loading it".
 */
import { describe, expect, test } from 'bun:test';
import { readManagedMcpServers } from '../../../src/settings/mcp/index.ts';
import type { PolicyLayer } from '../../../src/settings/index.ts';
import { layerOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const search = { type: 'http', url: 'https://search.example.com/mcp' };
const records = {
  type: 'http',
  url: 'https://records.example.com/mcp',
  headers: { 'X-Records-Key': 'key-issued-for-all-claude-code-users' },
};

const managed = (servers: Record<string, unknown>): PolicyLayer =>
  layerOf('managed', { managedMcpServers: servers });

const read = (servers: Record<string, unknown>) => readManagedMcpServers([managed(servers)]);
const loadedNames = (servers: Record<string, unknown>): readonly string[] =>
  read(servers).servers.map((each) => each.name);

spec('mcpSettings.managed.What an entry can contain', () => {
  test('the docs example loads both servers whole, as managed-scope candidates', () => {
    const { servers, issues } = read({ search, records });
    expect(issues).toEqual([]);
    expect(plain(servers)).toEqual([
      { scope: 'managed', name: 'search', server: search },
      { scope: 'managed', name: 'records', server: records },
    ]);
  });

  test('an sse entry loads, and streamable-http is read as http', () => {
    const { servers } = read({
      events: { type: 'sse', url: 'https://events.example.com/sse' },
      alias: { type: 'streamable-http', url: 'https://alias.example.com/mcp' },
    });
    expect(servers.map((each) => each.server.type)).toEqual(['sse', 'http']);
  });

  test('oauth and the other HTTP options are kept', () => {
    const entry = { ...search, oauth: { clientId: 'abc' }, timeout: 5000, alwaysLoad: true };
    expect(plain(read({ search: entry }).servers[0]?.server)).toEqual(entry);
  });

  test.each([
    ['stdio', { type: 'stdio', url: 'https://a.example.com/' }],
    ['ws', { type: 'ws', url: 'https://a.example.com/' }],
    ['no type', { url: 'https://a.example.com/' }],
  ])('an entry whose type is %s is dropped with a notice and the others load', (_, entry) => {
    const { servers, issues } = read({ bad: entry, search });
    expect(servers.map((each) => each.name)).toEqual(['search']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('bad');
    expect(issues[0]?.message).toContain('type');
  });

  test.each([
    ['plain http', 'http://search.example.com/mcp'],
    ['http on localhost', 'http://localhost:8080/mcp'],
    ['a file URL', 'file:///etc/mcp'],
    ['no URL', 'not a url'],
  ])('a url that is %s is dropped', (_, url) => {
    const { servers, issues } = read({ bad: { type: 'http', url }, search });
    expect(servers.map((each) => each.name)).toEqual(['search']);
    expect(issues[0]?.message).toContain('https');
  });

  test('https on localhost is fine', () => {
    expect(loadedNames({ local: { type: 'http', url: 'https://localhost:8443/mcp' } })).toEqual([
      'local',
    ]);
  });

  test.each(['command', 'args', 'env', 'headersHelper'])(
    'an entry with a %s member is dropped, even an empty one',
    (member) => {
      const value =
        member === 'command' || member === 'headersHelper' ? '' : member === 'args' ? [] : {};
      const { servers, issues } = read({ bad: { ...search, [member]: value }, search });
      expect(servers.map((each) => each.name)).toEqual(['search']);
      expect(issues[0]?.message).toContain(member);
    },
  );

  test.each([
    ['the url', { type: 'http', url: 'https://${HOST}/mcp' }],
    ['a header value', { ...search, headers: { Authorization: 'Bearer ${TOKEN}' } }],
    ['a nested oauth value', { ...search, oauth: { clientId: '${CLIENT}' } }],
    ['a reference with a default', { ...search, headers: { A: '${TOKEN:-none}' } }],
  ])('a ${VAR} reference in %s drops the entry: no expansion happens here', (_, entry) => {
    const { servers, issues } = read({ bad: entry, search });
    expect(servers.map((each) => each.name)).toEqual(['search']);
    expect(issues[0]?.message).toContain('${VAR}');
  });

  test('a literal dollar sign is a literal value', () => {
    const entry = { ...search, headers: { 'X-Price': '$5 and ${not a name}' } };
    expect(loadedNames({ priced: entry })).toEqual(['priced']);
  });

  test.each([['has space'], ['dotted.name'], ['slash/name'], ['café'], ['']])(
    'the name %j is refused',
    (name) => {
      expect(loadedNames({ [name]: search })).toEqual([]);
    },
  );

  test('letters, numbers, hyphens and underscores are a name', () => {
    expect(loadedNames({ 'Search_2-prod': search })).toEqual(['Search_2-prod']);
  });

  test.each([
    ['a control character in a value', { ...search, headers: { A: 'x\u0007y' } }],
    ['a zero-width space in a value', { ...search, headers: { A: 'x​y' } }],
    ['a right-to-left override in the url', { type: 'http', url: 'https://a.example.com/‮' }],
    ['a zero-width joiner in a key', { ...search, headers: { 'X-‍Key': 'v' } }],
  ])('%s drops the entry', (_, entry) => {
    const { servers, issues } = read({ bad: entry, search });
    expect(servers.map((each) => each.name)).toEqual(['search']);
    expect(issues[0]?.message).toContain('invisible');
  });

  test('an invisible character in the name drops the entry', () => {
    expect(loadedNames({ 'sea​rch': search })).toEqual([]);
  });

  test('the array form of Claude Desktop is not loaded and says so', () => {
    const arrayForm = [
      { name: 'search', transport: 'http', url: 'https://search.example.com/mcp' },
    ];
    const layer: PolicyLayer = {
      scope: 'managed',
      settings: Object.fromEntries([['managedMcpServers', arrayForm]]),
    };
    const { servers, issues } = readManagedMcpServers([layer]);
    expect(servers).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('managedMcpServers');
    // Read from a file, the same value is dropped with a notice by the settings reader itself.
    const fromFile = layerOf('managed', { managedMcpServers: arrayForm });
    expect(readManagedMcpServers([fromFile]).servers).toEqual([]);
  });
});

describe('managed server entry judgments', () => {
  // Judgment (spec/judgments.md): Unicode categories Cc, Cf, Zl and Zp are "control or invisible
  // formatting characters"; a name held by an invalid entry of a higher source does not fall back to
  // the entry of a lower one; the wording of the notice.
  test('line and paragraph separators count as invisible', () => {
    expect(loadedNames({ bad: { ...search, headers: { A: 'x y' } } })).toEqual([]);
  });

  test('a name an invalid higher entry holds is not given to the lower source', () => {
    const high = layerOf('managed', { managedMcpServers: { search: { type: 'stdio' } } });
    const low = layerOf('managed', { managedMcpServers: { search } });
    expect(readManagedMcpServers([high, low]).servers).toEqual([]);
  });

  test('a notice names the server and the reason', () => {
    const { issues } = read({ bad: { ...search, command: 'x' } });
    expect(issues[0]?.path).toBe('managedMcpServers.bad');
    expect(issues[0]?.message).toBe(
      'Managed MCP server "bad" was not loaded: it has a "command" member, and managed settings never name a program to run',
    );
  });

  test('the key in user settings provides nothing, as before', () => {
    const user = layerOf('user', { managedMcpServers: { search } });
    expect(readManagedMcpServers([user]).servers).toEqual([]);
  });
});
