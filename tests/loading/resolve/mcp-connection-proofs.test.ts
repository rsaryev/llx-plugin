/**
 * plugins/troubleshooting.md § Server is configured but never connects (the 15-minute cache of a failed stdio
 * connection, a schema failure that only the debug log records and `claude plugin validate` reports).
 */
import { expect, test } from 'bun:test';
import {
  droppedServerLogLine,
  MCP_FAILURE_SKIP_MS,
  readMcpConfig,
  skipsStdioConnection,
  SKIPPING_CONNECTION,
  validatePlugin,
  type PluginMcpServer,
} from '../../../src/index.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

spec('mcp.troubleshooting.Server is configured but never connects', () => {
  const stdio: PluginMcpServer = { command: 'node', args: ['s.js'] };
  const now = 10_000_000;

  test('a plugin stdio server whose connection failed less than 15 minutes earlier is not started', () => {
    expect(MCP_FAILURE_SKIP_MS).toBe(15 * 60_000);
    const failure = (age: number) => ({ atMs: now - age, server: stdio });
    expect(skipsStdioConnection(stdio, failure(60_000), now)).toBe(true);
    expect(skipsStdioConnection(stdio, failure(15 * 60_000 - 1), now)).toBe(true);
    expect(skipsStdioConnection(stdio, failure(15 * 60_000), now)).toBe(false);
    expect(skipsStdioConnection(stdio, undefined, now)).toBe(false);
  });

  test('the status that says so is the line errors.md quotes', () => {
    expect(SKIPPING_CONNECTION).toBe(
      'Skipping connection (recent failure cached; retries automatically in 15 min, or edit the plugin config to retry now)',
    );
  });

  test('editing the plugin config retries at once: the cache is for the configuration that failed', () => {
    const failure = { atMs: now - 60_000, server: stdio };
    expect(skipsStdioConnection({ command: 'node', args: ['other.js'] }, failure, now)).toBe(false);
  });

  test('a remote server is not cached this way', () => {
    const remote: PluginMcpServer = { type: 'http', url: 'https://x.test/mcp' };
    expect(skipsStdioConnection(remote, { atMs: now - 1_000, server: remote }, now)).toBe(false);
  });

  test('an entry that fails the schema is dropped; the debug log line is the one the docs quote, with no quotes around the server', () => {
    const { servers, issues } = readMcpConfig(
      { bad: { url: 'https://x.test' }, ok: { command: 'node' } },
      '.mcp.json',
    );
    expect(Object.keys(servers)).toEqual(['ok']);
    expect(issues).toHaveLength(1);
    expect(droppedServerLogLine('bad', '.mcp.json')).toBe(
      'Invalid MCP server config for bad in .mcp.json',
    );
  });

  test('claude plugin validate on the plugin directory finds that entry without loading the plugin, as an error', async () => {
    const report = await validatePlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          description: 'D',
          author: { name: 'A' },
        }),
        '.mcp.json': JSON.stringify({ mcpServers: { bad: { url: 'https://x.test' } } }),
      }),
    });
    expect(report.issues.map((found) => [found.severity, found.file])).toEqual([
      ['error', '.mcp.json'],
    ]);
  });
});
