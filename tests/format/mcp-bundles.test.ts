/**
 * plugins/manifest-reference.md § mcpServers ("A bundle path or URL must end in `.mcpb` or `.dxt`"),
 * plugins/components.md § Include a packaged MCPB server. The docs do not say what the kit does when
 * the host has no bundle reader, cannot find a bundle, fails to open it, or maps it badly, nor how an
 * `mcpServers` path that is not found, escapes the plugin or holds bad JSON is worded: every test
 * here is a judgment (spec/judgments.md), outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { collectMcpServers } from '../../src/entry/format.ts';
import { type PluginIssue } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { fakeBundles, node } from '../support/mcp-bundle.ts';

const messages = (issues: readonly PluginIssue[]) => issues.map((found) => found.message);

describe('bundles and the host (judgments)', () => {
  test('without a bundle reader the bundle is a warning naming the bundle, never a crash', async () => {
    const { servers, issues } = await collectMcpServers(memoryFiles({}), [
      './db.mcpb',
      { x: node('x.js') },
    ]);
    expect(Object.keys(servers)).toEqual(['x']);
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'mcpServers',
        message: 'MCP bundle ./db.mcpb needs an extractor: the host gave none',
      },
    ]);
  });

  test('a bundle the host cannot find, or fails to open, is an error naming it', async () => {
    const missing = await collectMcpServers(memoryFiles({}), './db.mcpb', {
      bundles: fakeBundles({}),
    });
    expect(messages(missing.issues)).toEqual(['mcpServers path not found: ./db.mcpb']);
    const failed = await collectMcpServers(memoryFiles({}), './db.mcpb', {
      bundles: fakeBundles({ 'db.mcpb': { failure: 'corrupt', message: 'not a zip' } }),
    });
    expect(failed.issues).toEqual([
      {
        severity: 'error',
        path: 'mcpServers',
        message: 'MCP bundle ./db.mcpb could not be opened: not a zip',
      },
    ]);
  });

  test('a server the host mapped badly is dropped like any invalid entry', async () => {
    const { servers, issues } = await collectMcpServers(memoryFiles({}), './db.mcpb', {
      bundles: fakeBundles({ 'db.mcpb': { name: 'db', server: { command: '' } } }),
    });
    expect(servers).toEqual({});
    expect(messages(issues)[0]).toStartWith('Invalid MCP server config for "db"');
  });

  test('the extension is matched exactly, an http URL is refused, and a path leaving the plugin is not read', async () => {
    const refused: [string, string][] = [
      ['./Bundle.MCPB', 'mcpServers bundle must end in .mcpb or .dxt: ./Bundle.MCPB'],
      [
        'http://example.com/s.mcpb',
        'mcpServers bundle URL must use https://: http://example.com/s.mcpb',
      ],
      [
        'https://x.test/s.mcpb?v=1',
        'mcpServers bundle must end in .mcpb or .dxt: https://x.test/s.mcpb?v=1',
      ],
    ];
    for (const [value, expected] of refused) {
      const bundles = fakeBundles({});
      const { servers, issues } = await collectMcpServers(memoryFiles({}), value, { bundles });
      expect(servers).toEqual({});
      expect(issues.map((found) => found.severity)).toEqual(['error']);
      expect(messages(issues)).toEqual([expected]);
      expect(bundles.opens).toEqual([]);
    }
    const bundles = fakeBundles({});
    const escaped = await collectMcpServers(memoryFiles({}), './../outside.json');
    expect(messages(escaped.issues)).toEqual([
      'mcpServers path escapes plugin directory: ./../outside.json',
    ]);
    expect(bundles.opens).toEqual([]);
  });

  test('a file that is not JSON, or not an object, is an error and loads nothing', async () => {
    const files = memoryFiles({ 'bad.json': '{ nope', 'list.json': '[1]' });
    const bad = await collectMcpServers(files, './bad.json');
    expect(bad.issues.map((found) => found.severity)).toEqual(['error']);
    expect(messages(bad.issues)[0]).toStartWith('mcpServers ./bad.json is not valid JSON');
    const list = await collectMcpServers(files, './list.json');
    expect(messages(list.issues)).toEqual([
      'mcpServers ./list.json must hold a JSON object of servers',
    ]);
  });

  test('a root .mcp.json that is broken reports at .mcp.json and the manifest sources still load', async () => {
    const files = memoryFiles({ '.mcp.json': '{ nope' });
    const { servers, issues } = await collectMcpServers(files, { x: node('x.js') });
    expect(Object.keys(servers)).toEqual(['x']);
    expect(issues.map((found) => [found.severity, found.path])).toEqual([['error', '.mcp.json']]);
  });

  test('no manifest value means only the root .mcp.json', async () => {
    const files = memoryFiles({
      '.mcp.json': JSON.stringify({ mcpServers: { db: node('d.js') } }),
    });
    expect((await collectMcpServers(files, undefined)).servers).toEqual({ db: node('d.js') });
  });
});
