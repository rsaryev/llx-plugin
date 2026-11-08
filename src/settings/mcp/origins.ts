import { BRACED_REFERENCE, isVariableName, splitDefault } from '../../format/mcp-env.ts';
import { isRemoteMcpServer, type PluginMcpServer } from '../../format/mcp-config.ts';

/**
 * Where a server comes from, as far as the lists are concerned (managed-mcp.md, "How a server is
 * evaluated" and "Servers that skip the allowlist check"). `configured` is every server a user, a
 * plugin or claude.ai adds, an agent's frontmatter declares or `--mcp-config` passes: all three checks.
 */
export const MCP_SERVER_ORIGINS = [
  'configured',
  'managedSettings',
  'managedFile',
  'builtIn',
  'claudeTagSlack',
  'inProcess',
] as const;
export type McpServerOrigin = (typeof MCP_SERVER_ORIGINS)[number];

/** Whether `text` holds a `${VAR}` reference (a braced reference whose name is a variable name). */
export const mentionsVariable = (text: string): boolean =>
  [...text.matchAll(BRACED_REFERENCE)].some((found) =>
    isVariableName(splitDefault(found[1] ?? '').name),
  );

/** Every text a `managed-mcp.json` server's "command, arguments, URL, or headers" holds; `env` is not one. */
const checkedTexts = (server: PluginMcpServer): readonly string[] =>
  isRemoteMcpServer(server)
    ? [server.url, ...Object.values(server.headers ?? {})]
    : [server.command, ...(server.args ?? [])];

export interface OriginRule {
  /** The denylist applies; in-process `type: "sdk"` servers "skip all three" checks. */
  readonly denylist: boolean;
  /** The server is not checked against the allowlist. */
  readonly skipsAllowlist: (server: PluginMcpServer) => boolean;
}

const always = (): boolean => true;
const never = (): boolean => false;

export const ORIGIN_RULES: { readonly [O in McpServerOrigin]: OriginRule } = {
  configured: { denylist: true, skipsAllowlist: never },
  // "every `managedMcpServers` entry"
  managedSettings: { denylist: true, skipsAllowlist: always },
  // "any `managed-mcp.json` entry whose values use no `${VAR}` expansion outside `env`"
  managedFile: {
    denylist: true,
    skipsAllowlist: (server) => !checkedTexts(server).some(mentionsVariable),
  },
  // "Claude in Chrome, the `ide` server ..., and servers the CLI itself configures"
  builtIn: { denylist: true, skipsAllowlist: always },
  // "a Claude Tag session's Slack tools"
  claudeTagSlack: { denylist: true, skipsAllowlist: always },
  inProcess: { denylist: false, skipsAllowlist: always },
};
