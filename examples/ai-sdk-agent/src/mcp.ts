/**
 * The plugins' MCP servers: the kit resolves each config (`${CLAUDE_PLUGIN_ROOT}`,
 * `${user_config.*}`, the process environment it gets); this host starts them with the official MCP
 * client and offers their tools under Claude Code's names, `mcp__plugin_<plugin>_<server>__<tool>`.
 */
import type { McpCaller, PluginSession } from '@rsaryev/claude-plugin-kit';
import type { ResolvedMcpServer } from '@rsaryev/claude-plugin-kit/loading';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { dynamicTool, jsonSchema, type JSONSchema7, type ToolSet } from 'ai';
import { z } from 'zod';
import { guarded, type ToolContext } from './tools.ts';

interface Connected {
  readonly server: ResolvedMcpServer;
  readonly client: Client;
  /** `plugin_<plugin>_<server>`: the middle of the tool names. */
  readonly prefix: string;
}

/** The parts of an MCP tool result this host reads. */
const resultSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).default([]),
});

const textOf = (result: unknown): string =>
  resultSchema
    .parse(result)
    .content.map((part) => part.text ?? `[${part.type}]`)
    .join('\n');

const strings = z.record(z.string(), z.string());
/** The resolved server config as this host starts it: a remote `url`, else a stdio command. */
const configSchema = z.union([
  z.object({ url: z.string(), headers: strings.default({}) }),
  z.object({
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: strings.default({}),
    cwd: z.string().optional(),
  }),
]);

const recordOf = (value: unknown): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).catch({}).parse(value);

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function connect(server: ResolvedMcpServer): Promise<Client> {
  const client = new Client({ name: 'kit-example-ai-sdk-agent', version: '0.0.0' });
  const config = configSchema.parse(server.server);
  const transport =
    'url' in config
      ? new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers },
        })
      : new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...processEnv(), ...server.environment, ...config.env },
          ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
          stderr: 'ignore',
        });
  await client.connect(transport);
  return client;
}

export class PluginMcp implements McpCaller {
  private readonly connected: Connected[] = [];

  /** Starts every resolved server; a server that fails is reported and left out. */
  async start(session: PluginSession, report: (message: string) => void): Promise<void> {
    const { resolved, issues } = await session.mcpServers();
    for (const issue of issues) report(`MCP: ${issue.path}: ${issue.message}`);
    for (const server of resolved) {
      const [, plugin = '', name = server.name] = server.key.split(':');
      try {
        const client = await connect(server);
        this.connected.push({ server, client, prefix: `plugin_${plugin}_${name}` });
      } catch (cause) {
        report(`MCP server ${server.key} did not start: ${String(cause)}`);
      }
    }
  }

  async tools(context: ToolContext): Promise<ToolSet> {
    const set: ToolSet = {};
    for (const { client, prefix } of this.connected) {
      const { tools } = await client.listTools();
      for (const listed of tools) {
        const name = `mcp__${prefix}__${listed.name}`;
        set[name] = dynamicTool({
          description: listed.description ?? listed.name,
          inputSchema: jsonSchema(listed.inputSchema satisfies JSONSchema7),
          execute: (input, { toolCallId }) =>
            guarded(context, { name, input: recordOf(input), toolUseId: toolCallId }, async (i) =>
              textOf(await client.callTool({ name: listed.name, arguments: i })),
            ),
        });
      }
    }
    return set;
  }

  /** The `McpCaller` port for `mcp_tool` hooks: `server` is the plugin's own server name. */
  async ensureConnected(server: string) {
    return this.find(server) ? ('connected' as const) : ('unavailable' as const);
  }

  async callTool(call: Parameters<McpCaller['callTool']>[0]) {
    const found = this.find(call.server);
    if (!found) return { failure: 'unavailable', message: `no MCP server ${call.server}` };
    const result = await found.client.callTool({ name: call.tool, arguments: { ...call.input } });
    return { isError: resultSchema.parse(result).isError === true, text: textOf(result) };
  }

  async close(): Promise<void> {
    await Promise.all(this.connected.map(({ client }) => client.close().catch(() => undefined)));
  }

  private find(server: string): Connected | undefined {
    return this.connected.find(
      (c) => c.server.name === server || c.server.key === server || c.prefix === server,
    );
  }
}
