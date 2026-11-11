/**
 * plugins/manifest-reference.md § mcpServers (the four shapes, "Claude Code loads `.mcp.json` at the
 * plugin root first, then each declared shape in order. A server name declared later replaces an
 * earlier one", "A bundle path or URL must end in `.mcpb` or `.dxt`. Any other extension fails
 * validation"); plugins/components.md § MCP servers (the `mcpServers` wrapper is optional; a manifest
 * server replaces a `.mcp.json` one of the same name) and § Include a packaged MCPB server (the
 * server takes the bundle manifest's `name`; a required setting with no saved value keeps it from
 * starting, with the quoted message); plugins/troubleshooting.md § Invalid MCP server config
 * (`Invalid MCP server config for "<server>": <error>`).
 *
 * Extracting or downloading a bundle, and reading the MCPB manifest, are the host's (the
 * `McpBundleReader` port): the tests assert what the kit decides, never that it "extracts". The
 * wording the docs do not quote is a judgment and is asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { classifyMcpSource, collectMcpServers } from '../../src/entry/format.ts';
import { type PluginIssue } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { bundle, fakeBundles, node, resolvedBundles } from '../support/mcp-bundle.ts';
import { spec } from '../support/spec.ts';

const messages = (issues: readonly PluginIssue[]) => issues.map((found) => found.message);

spec('mcp.source..json', () => {
  test('reads the file as an mcpServers map, wrapper or bare, after the root .mcp.json', async () => {
    const files = memoryFiles({
      '.mcp.json': JSON.stringify({
        mcpServers: { root: node('root.js'), shared: node('old.js') },
      }),
      'mcp/servers.json': JSON.stringify({
        mcpServers: { shared: node('new.js'), wrapped: node('w.js') },
      }),
      'mcp/bare.json': JSON.stringify({ bare: node('b.js') }),
    });
    const wrapped = await collectMcpServers(files, './mcp/servers.json');
    expect(wrapped.issues).toEqual([]);
    expect(wrapped.servers).toEqual({
      root: node('root.js'),
      shared: node('new.js'),
      wrapped: node('w.js'),
    });
    const bare = await collectMcpServers(files, './mcp/bare.json');
    expect(bare.issues).toEqual([]);
    expect(bare.servers).toEqual({
      root: node('root.js'),
      shared: node('old.js'),
      bare: node('b.js'),
    });
  });

  test('a file that is missing does not load, the rest of the plugin does', async () => {
    const files = memoryFiles({ '.mcp.json': JSON.stringify({ root: node('r.js') }) });
    const { servers, issues } = await collectMcpServers(files, './mcp/gone.json');
    expect(servers).toEqual({ root: node('r.js') });
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'mcpServers',
        message: 'mcpServers path not found: ./mcp/gone.json',
      },
    ]);
  });

  test('an entry Claude Code would drop is an error issue and the other entries load', async () => {
    const files = memoryFiles({
      'servers.json': JSON.stringify({
        mcpServers: {
          good: node('g.js'),
          'no-command': { args: ['x'] },
          'no-url': { type: 'http' },
        },
      }),
    });
    const { servers, issues } = await collectMcpServers(files, './servers.json');
    expect(Object.keys(servers)).toEqual(['good']);
    expect(issues.map((found) => found.severity)).toEqual(['error', 'error']);
    expect(messages(issues).map((text) => text.split(':')[0])).toEqual([
      'Invalid MCP server config for "no-command"',
      'Invalid MCP server config for "no-url"',
    ]);
  });
});

spec('mcp.source.Inline map', () => {
  test('uses the map as server configs keyed by name, looking at no file but .mcp.json', async () => {
    const files = memoryFiles({});
    const inline = { 'deploy-api': node('server.js') };
    const { servers, issues } = await collectMcpServers(files, inline);
    expect(issues).toEqual([]);
    expect(servers).toEqual(inline);
    expect(files.accesses.map(({ path }) => path)).toEqual(['.mcp.json']);
  });

  test('a manifest server replaces the .mcp.json server of the same name', async () => {
    const files = memoryFiles({
      '.mcp.json': JSON.stringify({ db: node('old.js'), keep: node('k.js') }),
    });
    const { servers } = await collectMcpServers(files, { db: node('new.js') });
    expect(servers).toEqual({ db: node('new.js'), keep: node('k.js') });
  });

  test('an array mixing a file, an inline map and a bundle keeps its order: the later name wins', async () => {
    const files = memoryFiles({
      'a.json': JSON.stringify({ one: node('a1.js'), two: node('a2.js'), three: node('a3.js') }),
    });
    const bundles = fakeBundles({ 'b.mcpb': bundle('two') });
    const { servers, issues } = await collectMcpServers(
      files,
      ['./a.json', { three: node('inline.js') }, './b.mcpb'],
      { bundles },
    );
    expect(issues).toEqual([]);
    expect(servers).toEqual({
      one: node('a1.js'),
      two: { command: 'two-server' },
      three: node('inline.js'),
    });
  });

  test('a later source replaces an earlier one even when the earlier is a bundle', async () => {
    const files = memoryFiles({});
    const { servers } = await collectMcpServers(files, ['./b.mcpb', { two: node('inline.js') }], {
      bundles: fakeBundles({ 'b.mcpb': bundle('two') }),
    });
    expect(servers).toEqual({ two: node('inline.js') });
  });
});

describe('every source is told from the others by its shape', () => {
  test('classifies the four shapes of the table', () => {
    const kinds = [
      './mcp/servers.json',
      './bundle.mcpb',
      'https://example.com/server.mcpb',
      { 'deploy-api': node('server.js') },
    ].map((value) => classifyMcpSource(value)?.kind);
    expect(kinds).toEqual(['json-file', 'bundle-path', 'bundle-url', 'inline-map']);
  });
  test('a value that is none of them (a number, null) is no source', () => {
    expect(classifyMcpSource(5)).toBeUndefined();
    expect(classifyMcpSource(null)).toBeUndefined();
  });
});

spec('mcp.source.MCP bundle path', () => {
  test('hands a .mcpb or .dxt path to the host with the .mcpb-cache folder, rooted at the plugin', async () => {
    const bundles = fakeBundles({ 'servers/db.mcpb': bundle('db'), 'old.dxt': bundle('legacy') });
    const { servers, issues } = await collectMcpServers(
      memoryFiles({}),
      ['./servers/db.mcpb', './old.dxt'],
      {
        bundles,
      },
    );
    expect(issues).toEqual([]);
    expect(bundles.opens).toEqual([
      { source: { kind: 'path', path: 'servers/db.mcpb' }, cacheDir: '.mcpb-cache' },
      { source: { kind: 'path', path: 'old.dxt' }, cacheDir: '.mcpb-cache' },
    ]);
    expect(Object.keys(servers)).toEqual(['db', 'legacy']);
  });

  test('the server takes its name from the name in the bundle manifest, not from the file', async () => {
    const { servers } = await collectMcpServers(memoryFiles({}), './servers/db.mcpb', {
      bundles: fakeBundles({ 'servers/db.mcpb': bundle('inventory') }),
    });
    expect(Object.keys(servers)).toEqual(['inventory']);
  });

  test('any other extension fails validation and the host is not asked', async () => {
    const bundles = fakeBundles({ 'bundle.zip': bundle('x') });
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './bundle.zip', {
      bundles,
    });
    expect(servers).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(bundles.opens).toEqual([]);
  });

  test('a path that leaves the plugin is not read and the host is not asked', async () => {
    const bundles = fakeBundles({ 'x.mcpb': bundle('x') });
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './../x.mcpb', {
      bundles,
    });
    expect(servers).toEqual({});
    expect(issues).toEqual([
      {
        severity: 'error',
        path: 'mcpServers',
        message: 'mcpServers path escapes plugin directory: ./../x.mcpb',
      },
    ]);
    expect(bundles.opens).toEqual([]);
  });

  test('a bundle path the host does not find is a path that is not found', async () => {
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './gone.mcpb', {
      bundles: fakeBundles({}),
    });
    expect(servers).toEqual({});
    expect(issues).toEqual([
      { severity: 'error', path: 'mcpServers', message: 'mcpServers path not found: ./gone.mcpb' },
    ]);
  });

  test('a bundled server loads whatever its settings: the verdict on them is made when it is resolved', async () => {
    const bundles = fakeBundles({ 'db.mcpb': bundle('db', { api_key: { required: true } }) });
    const {
      servers,
      bundles: declared,
      issues,
    } = await collectMcpServers(memoryFiles({}), ['./db.mcpb', { other: node('o.js') }], {
      bundles,
    });
    expect(issues).toEqual([]);
    expect(Object.keys(servers)).toEqual(['db', 'other']);
    expect(Object.keys(declared)).toEqual(['db']);
  });
});

spec('mcp.source.MCP bundle URL', () => {
  test('hands an https URL ending in .mcpb to the host with the .mcpb-cache folder', async () => {
    const url = 'https://example.com/server.mcpb';
    const bundles = fakeBundles({ [url]: bundle('remote-db') });
    const { servers, issues } = await collectMcpServers(memoryFiles({}), url, { bundles });
    expect(issues).toEqual([]);
    expect(bundles.opens).toEqual([{ source: { kind: 'url', url }, cacheDir: '.mcpb-cache' }]);
    expect(Object.keys(servers)).toEqual(['remote-db']);
  });

  test('a URL must end in .mcpb or .dxt too, and the host is not asked', async () => {
    const bundles = fakeBundles({});
    const { issues } = await collectMcpServers(memoryFiles({}), 'https://example.com/server.zip', {
      bundles,
    });
    expect(issues.map((found) => found.severity)).toEqual(['error']);
    expect(bundles.opens).toEqual([]);
    const dxt = await collectMcpServers(memoryFiles({}), 'https://example.com/old.dxt', {
      bundles: fakeBundles({ 'https://example.com/old.dxt': bundle('old') }),
    });
    expect(dxt.issues).toEqual([]);
  });

  test('a bundle URL takes the same "needs configuration" rule', async () => {
    const url = 'https://example.com/server.mcpb';
    const reader = fakeBundles({ [url]: bundle('remote-db', { token: { required: true } }) });
    const { names, issues } = await resolvedBundles(url, reader);
    expect(names).toEqual([]);
    expect(messages(issues)).toEqual([
      'Bundled MCP server "remote-db" was not started: it needs configuration',
    ]);
  });
});
