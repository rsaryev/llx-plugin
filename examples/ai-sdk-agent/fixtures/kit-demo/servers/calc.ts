/**
 * kit-demo's stdio MCP server: `add` adds two numbers; `greeting` returns the `GREETING` the plugin's
 * `.mcp.json` sets from `${user_config.greeting}`, so a test can see the kit substituted it.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'calc', version: '1.0.0' });

server.registerTool(
  'add',
  { description: 'Add two numbers.', inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }),
);

server.registerTool(
  'greeting',
  { description: 'The greeting word this server was configured with.', inputSchema: {} },
  async () => ({ content: [{ type: 'text', text: process.env.GREETING ?? '(unset)' }] }),
);

await server.connect(new StdioServerTransport());
