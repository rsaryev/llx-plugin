import { error, warning, type PluginIssue } from './issues.ts';
import { readMcpServer, signsInWithOAuth, type PluginMcpServer } from './mcp-config.ts';
import type { EnvLookup } from './mcp-env.ts';
import { readMcpOAuth, type McpOAuthConfig } from './mcp-oauth.ts';
import { isRecord } from '../protocol/is-record.ts';

/**
 * `claude mcp add-json <name> '<json>'` and the part of `claude mcp add` that both share (mcp.md, "Add
 * MCP servers from JSON configuration", "Use pre-configured OAuth credentials", "Add a server from
 * setup instructions written for another client"): the input becomes a server entry, the OAuth
 * credentials the add carries, and what the host must ask for. The stored configuration, the keychain
 * and the prompt are the host's.
 */
export const MCP_ADD_SCOPES = ['local', 'project', 'user'] as const;
export type McpAddScope = (typeof MCP_ADD_SCOPES)[number];

/** Where the client secret comes from: "The `--client-secret` flag prompts", or `MCP_CLIENT_SECRET`. */
export type McpSecretRequest =
  | { readonly source: 'prompt' }
  | { readonly source: 'environment'; readonly value: string };

export interface McpAddOptions {
  /** `--scope`; local when absent. */
  readonly scope?: string;
  /** `--client-secret`. */
  readonly clientSecret?: boolean;
  /** The servers already stored, as `mcpAddKey(scope, name)`: an add of one of them fails. */
  readonly existing?: ReadonlySet<string>;
}

export interface McpAddRead {
  readonly name: string;
  readonly scope: McpAddScope | undefined;
  /** Undefined when the add is refused. */
  readonly server: PluginMcpServer | undefined;
  /** The OAuth setup that applies: the entry's `oauth` block, with `MCP_OAUTH_CALLBACK_PORT` filled in. */
  readonly oauth: McpOAuthConfig | undefined;
  /** Present only with `--client-secret` on an HTTP or SSE server. Never stored in `server`. */
  readonly secret: McpSecretRequest | undefined;
  readonly issues: readonly PluginIssue[];
}

const SECRET_VARIABLE = 'MCP_CLIENT_SECRET';
const PORT_VARIABLE = 'MCP_OAUTH_CALLBACK_PORT';

/** Judgment (spec/judgments.md): "letters, numbers, hyphens, and underscores", the docs' own list. */
const NAME = /^[A-Za-z0-9_-]+$/;

const refusal = (name: string, scope: McpAddScope | undefined, issue: PluginIssue): McpAddRead => ({
  name,
  scope,
  server: undefined,
  oauth: undefined,
  secret: undefined,
  issues: [issue],
});

/** The path of an issue about an entry being added. */
const pathOf = (name: string): string => `mcpServers.${name}`;

const isScope = (text: string): text is McpAddScope =>
  MCP_ADD_SCOPES.some((scope) => scope === text);

/** The scope an add writes to: "Each command writes to local scope unless you add `--scope project` or `--scope user`". */
export function readAddScope(name: string, scope: string | undefined): McpAddScope | PluginIssue {
  if (scope === undefined) return 'local';
  if (isScope(scope)) return scope;
  const names = MCP_ADD_SCOPES.map((each) => `"${each}"`);
  return error(
    pathOf(name),
    `Invalid scope "${scope}": use ${names.slice(0, -1).join(', ')} or ${names.at(-1)}`,
  );
}

/** "Claude Code adds no server named like that": the message of `claude mcp add` for a name taken at that scope. */
export const mcpServerExistsMessage = (name: string, scope: McpAddScope): string =>
  `MCP server ${name} already exists in ${scope} config`;

/**
 * How the host names a stored server for `McpAddOptions.existing`: the scope and the name, which
 * together make "the same server name at the same scope". A name has no `:` (see `NAME`).
 */
export const mcpAddKey = (scope: McpAddScope, name: string): string => `${scope}:${name}`;

/** A port written the way a redirect URI carries it. Judgment: anything else is no port. */
function portOf(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : undefined;
}

const withoutOAuth = (entry: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'oauth'));

const NO_OAUTH =
  'OAuth works with HTTP and SSE servers only: the oauth block and the OAuth flags have no effect on this server';

/** `--client-secret` asks for the secret; `MCP_CLIENT_SECRET` answers the prompt when it is set. */
function secretOf(options: McpAddOptions, lookup: EnvLookup): McpSecretRequest | undefined {
  if (options.clientSecret !== true) return undefined;
  const fromEnvironment = lookup(SECRET_VARIABLE);
  return fromEnvironment === undefined || fromEnvironment === ''
    ? { source: 'prompt' }
    : { source: 'environment', value: fromEnvironment };
}

/** The block, with `MCP_OAUTH_CALLBACK_PORT` filled in when the block names no port. */
function withEnvironmentPort(block: ReturnType<typeof readMcpOAuth>, lookup: EnvLookup) {
  const envPort = portOf(lookup(PORT_VARIABLE));
  const unusable = block.issues.some((found) => found.severity === 'error');
  const port = block.oauth?.callbackPort === undefined ? envPort : undefined;
  return unusable || port === undefined ? block.oauth : { ...block.oauth, callbackPort: port };
}

/** What an OAuth-bearing add means for one server, once its entry has been read. */
function oauthOf(
  added: { readonly name: string; readonly entry: Record<string, unknown> },
  server: PluginMcpServer,
  options: McpAddOptions,
  lookup: EnvLookup,
) {
  const { name, entry } = added;
  const path = pathOf(name);
  if (!signsInWithOAuth(server)) {
    const asked = entry.oauth !== undefined || options.clientSecret === true;
    const issues = asked ? [warning(path, `MCP server "${name}": ${NO_OAUTH}`)] : [];
    return { oauth: undefined, secret: undefined, issues };
  }
  const block = readMcpOAuth(name, entry.oauth, path);
  return {
    oauth: withEnvironmentPort(block, lookup),
    secret: secretOf(options, lookup),
    issues: block.issues,
  };
}

/**
 * Finishes an add whose entry is known: refuses a name already stored at the scope, reads the entry as
 * a server and settles the OAuth setup and the secret. Judgments (spec/judgments.md): `add-json`
 * refuses a taken name as `add` does; `MCP_OAUTH_CALLBACK_PORT` fills the port only when the entry
 * names none; the secret is requested only by `--client-secret`, never by the environment variable
 * alone ("Avoids the interactive prompt when adding a server with `--client-secret`"); an invalid
 * `oauth` block is an error and leaves the entry itself read.
 */
export function completeMcpAdd(
  target: { readonly name: string; readonly scope: McpAddScope },
  entry: Record<string, unknown>,
  options: McpAddOptions,
  lookup: EnvLookup,
): McpAddRead {
  const { name, scope } = target;
  if (options.existing?.has(mcpAddKey(scope, name)) === true) {
    return refusal(name, scope, error(pathOf(name), mcpServerExistsMessage(name, scope)));
  }
  const read = readMcpServer(name, entry, pathOf(name));
  if (read.server === undefined) {
    return {
      name,
      scope,
      server: undefined,
      oauth: undefined,
      secret: undefined,
      issues: read.issues,
    };
  }
  const settled = oauthOf({ name, entry }, read.server, options, lookup);
  // An `oauth` block that has no effect on this transport is not stored.
  const stored =
    entry.oauth !== undefined && settled.oauth === undefined && !signsInWithOAuth(read.server)
      ? readMcpServer(name, withoutOAuth(entry), pathOf(name)).server
      : read.server;
  return {
    name,
    scope,
    server: stored,
    oauth: settled.oauth,
    secret: settled.secret,
    issues: [...read.issues, ...settled.issues],
  };
}

const WRAPPER = (name: string): string =>
  `MCP server "${name}": pass the object inside "mcpServers", not the wrapper that holds it`;

/**
 * `claude mcp add-json <name> '<json>'`: "The JSON must conform to the MCP server configuration
 * schema" (`readMcpServer`). The wording of a refusal other than `Invalid MCP server config for
 * "<server>": <error>` and the two messages mcp.md quotes is the kit's (spec/judgments.md).
 */
export function readMcpAddJson(
  name: string,
  json: string,
  options: McpAddOptions,
  lookup: EnvLookup,
): McpAddRead {
  const scope = readAddScope(name, options.scope);
  if (typeof scope !== 'string') return refusal(name, undefined, scope);
  if (!NAME.test(name)) {
    const why = `Invalid name "${name}": a server name uses only letters, numbers, hyphens and underscores`;
    return refusal(name, scope, error(pathOf(name), why));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (problem) {
    const why = problem instanceof Error ? problem.message : 'invalid JSON';
    return refusal(name, scope, error(pathOf(name), `The JSON is not valid: ${why}`));
  }
  if (!isRecord(parsed)) {
    return refusal(
      name,
      scope,
      error(pathOf(name), 'The JSON must be an object: the server entry'),
    );
  }
  if (isRecord(parsed.mcpServers) && parsed.command === undefined && parsed.url === undefined) {
    return refusal(name, scope, error(pathOf(name), WRAPPER(name)));
  }
  return completeMcpAdd({ name, scope }, parsed, options, lookup);
}
