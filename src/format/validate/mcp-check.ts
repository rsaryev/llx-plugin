import { z } from 'zod';
import { errorAt, warningAt, type Finding } from './finding.ts';
import { kindOf } from './received.ts';
import { dotted } from './zod-findings.ts';
import { isRecord } from '../../protocol/is-record.ts';
import { userConfigReferences } from '../user-config-refs.ts';

/**
 * The MCP server checks of `claude plugin validate` on `.mcp.json` (oracle 2.1.319; the changelog's
 * "reports `.mcp.json` entries that would be silently dropped at load, undeclared
 * `${user_config.*}` references, and insecure URLs"). The file is a `mcpServers` wrapper or the bare
 * map of servers; each entry is read on its own.
 */
const DROPPED = ' The plugin loader silently drops this server at load.';
const text = z.string();
const common = { timeout: z.number().optional(), alwaysLoad: z.boolean().optional() };
const remote = {
  url: text,
  headers: z.record(text, text).optional(),
  headersHelper: text.optional(),
  oauth: z
    .object({
      clientId: text.optional(),
      callbackPort: z.number().optional(),
      scopes: text.optional(),
    })
    .optional(),
  ...common,
};

const SCHEMAS = {
  stdio: z.object({
    command: text,
    args: z.array(text).optional(),
    env: z.record(text, text).optional(),
    ...common,
  }),
  http: z.object(remote),
  sse: z.object(remote),
  ws: z.object(remote),
} as const;
type Transport = keyof typeof SCHEMAS;
const isTransport = (value: unknown): value is Transport =>
  typeof value === 'string' && Object.hasOwn(SCHEMAS, value);

/** Another name of a transport (mcp.md, "Option 2": `streamable-http` is an alias for `http`). */
const ALIASES: Readonly<Record<string, Transport>> = { 'streamable-http': 'http' };
const aliasOf = (value: unknown): Transport | undefined =>
  typeof value === 'string' && Object.hasOwn(ALIASES, value) ? ALIASES[value] : undefined;

const TYPES_TAIL =
  'expected "stdio" (or no type) for a local command, or "http", "sse", "ws" for a remote server.';
const NO_TYPE =
  'server has a "url" but no "type". Remote servers must set "type" to "http" (or "sse" / "ws"); without it the entry is parsed as a stdio server, fails for lacking "command", and is silently dropped at load.';
const HOST_ONLY =
  'type "sdk" servers are registered by the host application at runtime and cannot be declared by a plugin. The plugin loader drops this server at load.';
const CLEARTEXT =
  'url uses http:// to a non-loopback host — requests, headers and any credentials travel in cleartext. Use https://; plugin directories may reject insecure remote server urls.';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function insecureUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === 'http:' && !LOOPBACK.has(parsed.hostname);
}

/** How the oracle names the declared type of a server it cannot place. */
const shownType = (type: unknown): string =>
  typeof type === 'string' ? `"${type}"` : kindOf(type);

/** The transport a server declares, or the finding that says it cannot be placed. */
function transportOf(path: string, server: Record<string, unknown>): Transport | Finding {
  const { type } = server;
  if (type === undefined) {
    return 'url' in server && !('command' in server) ? errorAt(`${path}.type`, NO_TYPE) : 'stdio';
  }
  if (type === 'sdk') return errorAt(`${path}.type`, HOST_ONLY);
  if (isTransport(type)) return type;
  const alias = aliasOf(type);
  if (alias !== undefined) return alias;
  return errorAt(
    `${path}.type`,
    `unknown server type ${shownType(type)} — ${TYPES_TAIL}${DROPPED}`,
  );
}

/** The strings of a server a `${user_config.*}` reference may sit in, with their paths. */
function referencing(server: Record<string, unknown>): ReadonlyArray<readonly [string, string]> {
  const strings = (key: string): ReadonlyArray<readonly [string, string]> => {
    const value = server[key];
    if (typeof value === 'string') return [[key, value]];
    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        typeof item === 'string' ? [[`${key}.${index}`, item] as const] : [],
      );
    }
    return isRecord(value)
      ? Object.entries(value).flatMap(([name, item]) =>
          typeof item === 'string' ? [[`${key}.${name}`, item] as const] : [],
        )
      : [];
  };
  return ['command', 'args', 'env', 'url', 'headers'].flatMap(strings);
}

function undeclaredReferences(
  path: string,
  server: Record<string, unknown>,
  declared: ReadonlySet<string>,
): Finding[] {
  return referencing(server).flatMap(([where, value]) =>
    userConfigReferences(value)
      .filter((key) => !declared.has(key))
      .map((key) =>
        errorAt(
          `${path}.${where}`,
          `references \${user_config.${key}}, which plugin.json does not declare under "userConfig" (or in this server's "channels" entry), so on a fresh install it cannot resolve: the loader drops the server or passes the literal text through. Declare the option or fix the key.`,
        ),
      ),
  );
}

function serverFindings(path: string, server: unknown, declared: ReadonlySet<string>): Finding[] {
  if (!isRecord(server)) {
    return [errorAt(path, `server config must be an object (got ${kindOf(server)}).${DROPPED}`)];
  }
  const transport = transportOf(path, server);
  if (typeof transport !== 'string') return [transport];
  const parsed = SCHEMAS[transport].safeParse(server);
  const schema = parsed.success
    ? []
    : parsed.error.issues.map((found) =>
        errorAt(dotted(path, found.path), `${found.message}.${DROPPED}`),
      );
  const cleartext = insecureUrl(server.url) ? [warningAt(`${path}.url`, CLEARTEXT)] : [];
  return [...schema, ...undeclaredReferences(path, server, declared), ...cleartext];
}

function serverLoads(server: unknown): boolean {
  if (!isRecord(server)) return false;
  const transport = transportOf('', server);
  return typeof transport === 'string' && SCHEMAS[transport].safeParse(server).success;
}

/** Whether every server of an inline `mcpServers` map is one the loader keeps. */
export const inlineServersValid = (servers: Readonly<Record<string, unknown>>): boolean =>
  Object.values(servers).every(serverLoads);

/** Only what the manifest's own schema leaves to the MCP check: undeclared references and cleartext URLs. */
function inlineFindings(servers: Readonly<Record<string, unknown>>, declared: ReadonlySet<string>) {
  return Object.entries(servers).flatMap(([name, server]) =>
    isRecord(server)
      ? [
          ...undeclaredReferences(`mcpServers.${name}`, server, declared),
          ...(insecureUrl(server.url) ? [warningAt(`mcpServers.${name}.url`, CLEARTEXT)] : []),
        ]
      : [],
  );
}

export { inlineFindings };

/** The findings of a parsed `.mcp.json`. */
export function mcpFindings(raw: unknown, declared: ReadonlySet<string>): Finding[] {
  if (!isRecord(raw)) return [];
  const wrapped = Object.hasOwn(raw, 'mcpServers');
  const servers = wrapped ? raw.mcpServers : raw;
  if (!isRecord(servers)) {
    return !wrapped || Array.isArray(servers)
      ? []
      : [
          errorAt(
            'mcpServers',
            `must be an object mapping server names to server configs (got ${kindOf(servers)}). No servers load from this file.`,
          ),
        ];
  }
  return Object.entries(servers).flatMap(([name, server]) =>
    serverFindings(wrapped ? `mcpServers.${name}` : name, server, declared),
  );
}
