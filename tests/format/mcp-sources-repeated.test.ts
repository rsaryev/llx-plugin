/** A repeated MCP config file (judgment, spec/judgments.md): plugins/manifest-reference.md § mcpServers loads `.mcp.json` first, then each declared shape; one file loads once. */
import { describe, expect, test } from 'bun:test';
import { collectMcpServers } from '../../src/entry/format.ts';
import { memoryFiles } from '../support/ports.ts';
import { node } from '../support/mcp-bundle.ts';

// Judgment (spec/judgments.md), as for hooks and the other config files: a file that is already a
// source loads once, so naming `.mcp.json` or one file twice reports its problems once.
describe('a repeated MCP config file', () => {
  test('a declared ./.mcp.json or a file listed twice is read once', async () => {
    const files = memoryFiles({
      '.mcp.json': JSON.stringify({ mcpServers: { root: node('root.js') } }),
      'mcp/broken.json': '{ not json',
    });
    const root = await collectMcpServers(files, './.mcp.json');
    expect(root.servers).toEqual({ root: node('root.js') });
    expect(files.accesses.filter((one) => one.operation === 'readText')).toHaveLength(1);
    const twice = await collectMcpServers(files, ['./mcp/broken.json', 'mcp//broken.json']);
    expect(twice.issues).toHaveLength(1);
    expect(twice.issues[0]?.message).toStartWith('mcpServers ./mcp/broken.json is not valid JSON:');
  });
  test('a declared ./.mcp.json that is missing is reported, as any declared file is', async () => {
    const { issues } = await collectMcpServers(memoryFiles({}), './.mcp.json');
    expect(issues).toHaveLength(1);
  });
});
