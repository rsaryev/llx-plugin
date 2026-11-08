import { z } from 'zod';
import { hasAuthorizationHeader } from './helper-headers.ts';
import { error, warning, type PluginIssue } from './issues.ts';
import { signsInWithOAuth, type PluginMcpServer } from './mcp-config.ts';

/**
 * The `oauth` block of a remote server's entry and what it decides (mcp.md, "Use a fixed OAuth
 * callback port", "Use pre-configured OAuth credentials", "Override OAuth metadata discovery",
 * "Restrict OAuth scopes", "Use OAuth with a server behind an authenticating proxy", "Authenticate
 * with remote MCP servers"). Pure data: the OAuth flow itself, the browser, the token store and the
 * HTTP requests are the host's.
 */
export interface McpOAuthConfig {
  /** The pre-registered client's ID. */
  readonly clientId?: string;
  /** The fixed port of the redirect URI `http://localhost:PORT/callback`. */
  readonly callbackPort?: number;
  /** "The URL must use `https://`": the metadata document that replaces the discovery chain. */
  readonly authServerMetadataUrl?: string;
  /** "A single space-separated string, matching the `scope` parameter format in RFC 6749 §3.3". */
  readonly scopes?: string;
}

export interface McpOAuthRead {
  /** Undefined when the block is absent or one of its fields is refused. */
  readonly oauth: McpOAuthConfig | undefined;
  readonly issues: readonly PluginIssue[];
}

const isHttps = (text: string): boolean =>
  URL.canParse(text) && new URL(text).protocol === 'https:';

/** Judgment (spec/judgments.md): a port is a whole number a redirect URI can carry, 1 to 65535. */
const FIELDS = {
  clientId: z.string().min(1),
  callbackPort: z.int().min(1).max(65535),
  authServerMetadataUrl: z.string().refine(isHttps, { error: 'must be an https:// URL' }),
  scopes: z.string().min(1),
} satisfies { readonly [K in keyof McpOAuthConfig]-?: z.ZodType };

const BLOCK = z.looseObject({
  clientId: FIELDS.clientId.exactOptional(),
  callbackPort: FIELDS.callbackPort.exactOptional(),
  authServerMetadataUrl: FIELDS.authServerMetadataUrl.exactOptional(),
  scopes: FIELDS.scopes.exactOptional(),
});

const refused = (name: string, why: string): McpOAuthRead => ({
  oauth: undefined,
  issues: [error('oauth', `Invalid MCP server config for "${name}": ${why}`)],
});

/** The one key mcp.md says never lives in the configuration. */
const SECRET_KEY = 'clientSecret';

function unknownKey(name: string, origin: string, key: string): PluginIssue {
  const message =
    key === SECRET_KEY
      ? `MCP server "${name}" has "oauth.${key}", which is not a configuration field: the client secret is given only when the server is added (--client-secret, MCP_CLIENT_SECRET)`
      : `MCP server "${name}" has "oauth.${key}", which Claude Code does not read`;
  return warning(origin, message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the value of a server's `oauth` key. Judgments (spec/judgments.md): a field the docs do not
 * list is a warning and is not kept (so a secret never travels in the entry); a field of the wrong
 * type makes the whole block unusable, since half an OAuth setup would sign in with another client.
 */
export function readMcpOAuth(name: string, raw: unknown, origin: string): McpOAuthRead {
  if (raw === undefined) return { oauth: undefined, issues: [] };
  if (!isRecord(raw)) return refused(name, 'oauth: expected an object');
  const parsed = BLOCK.safeParse(raw);
  if (!parsed.success) {
    const why = parsed.error.issues
      .map((found) => `${['oauth', ...found.path].join('.')}: ${found.message}`)
      .join('; ');
    return refused(name, why);
  }
  const known = new Set<string>(Object.keys(FIELDS));
  const kept = Object.entries(parsed.data).filter(([key]) => known.has(key));
  const extra = Object.keys(parsed.data).filter((key) => !known.has(key));
  return {
    oauth: Object.fromEntries(kept),
    issues: extra.map((key) => unknownKey(name, origin, key)),
  };
}

/** The redirect URI a fixed callback port registers (mcp.md: `http://localhost:PORT/callback`; never `127.0.0.1`). */
export const mcpOAuthRedirectUri = (port: number): string => `http://localhost:${port}/callback`;

/** Where the authorization server's metadata is looked for. */
export type McpOAuthDiscovery =
  | { readonly kind: 'configured'; readonly url: string }
  | { readonly kind: 'chain'; readonly urls: readonly string[] };

const PROTECTED_RESOURCE = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER = '/.well-known/oauth-authorization-server';

/**
 * "By default, Claude Code first checks RFC 9728 Protected Resource Metadata at
 * `/.well-known/oauth-protected-resource`, then falls back to RFC 8414 authorization server metadata
 * at `/.well-known/oauth-authorization-server`"; `authServerMetadataUrl` bypasses that chain.
 * Judgment (spec/judgments.md): both paths are taken from the server's origin, as the docs write them
 * (RFC 9728 and RFC 8414 also define forms that insert the path of the resource).
 */
export function mcpOAuthDiscovery(
  serverUrl: string,
  config: McpOAuthConfig | undefined,
): McpOAuthDiscovery {
  if (config?.authServerMetadataUrl !== undefined) {
    return { kind: 'configured', url: config.authServerMetadataUrl };
  }
  const origin = new URL(serverUrl).origin;
  return {
    kind: 'chain',
    urls: [`${origin}${PROTECTED_RESOURCE}`, `${origin}${AUTHORIZATION_SERVER}`],
  };
}

/** The metadata of an authorization server as far as scopes go. */
export interface McpOAuthMetadata {
  /** `configured`: fetched from `authServerMetadataUrl`; `discovered`: found by the chain. */
  readonly source: 'configured' | 'discovered';
  readonly scopesSupported?: readonly string[];
}

const OFFLINE_ACCESS = 'offline_access';

/** "Metadata fetched from a configured `authServerMetadataUrl` still supplies its `scopes_supported`"; discovered metadata does not. */
const SUPPLIES_SCOPES: { readonly [S in McpOAuthMetadata['source']]: boolean } = {
  configured: true,
  discovered: false,
};

/**
 * The `scope` of the authorization request, or `undefined` for none (the server decides). "`oauth.scopes`
 * takes precedence over both `authServerMetadataUrl` and the scopes the server discovers"; when the
 * server advertises `offline_access` it is appended to the pinned scopes. Unset: discovered metadata
 * does not put its whole `scopes_supported` catalog in the request, while metadata fetched from a
 * configured `authServerMetadataUrl` "still supplies its `scopes_supported` as the requested scopes".
 */
export function requestedOAuthScopes(
  config: McpOAuthConfig | undefined,
  metadata: McpOAuthMetadata,
): string | undefined {
  const supported = metadata.scopesSupported ?? [];
  if (config?.scopes !== undefined) {
    const pinned = config.scopes.split(/\s+/).filter((scope) => scope.length > 0);
    const refreshable = supported.includes(OFFLINE_ACCESS) && !pinned.includes(OFFLINE_ACCESS);
    return (refreshable ? [...pinned, OFFLINE_ACCESS] : pinned).join(' ');
  }
  return SUPPLIES_SCOPES[metadata.source] && supported.length > 0 ? supported.join(' ') : undefined;
}

export type McpOAuthPlan =
  | {
      readonly oauth: true;
      /** Sent with the OAuth requests too, so a proxy that checks a header of its own lets them through. */
      readonly headers: Readonly<Record<string, string>>;
      readonly config?: McpOAuthConfig;
    }
  | { readonly oauth: false; readonly reason: 'transport' | 'authorization-header' };

/**
 * Whether a server signs in with OAuth, and with which headers. "OAuth authentication works with HTTP
 * servers" and the flags apply "to HTTP and SSE transports"; WebSocket "supports neither" and a stdio
 * server has no URL. "If you configure an `Authorization` header, Claude Code uses it as the server's
 * credential and doesn't fall back to OAuth for that server": `headers` are the ones the connection
 * sends (static headers with a `headersHelper`'s output merged in, as `connectionHeaders` does).
 */
export function planMcpOAuth(
  server: PluginMcpServer,
  connection: {
    readonly headers: Readonly<Record<string, string>>;
    readonly oauth?: McpOAuthConfig;
  },
): McpOAuthPlan {
  if (!signsInWithOAuth(server)) return { oauth: false, reason: 'transport' };
  if (hasAuthorizationHeader(connection.headers)) {
    return { oauth: false, reason: 'authorization-header' };
  }
  return {
    oauth: true,
    headers: connection.headers,
    ...(connection.oauth === undefined ? {} : { config: connection.oauth }),
  };
}

/** What a rejected request means for a server (mcp.md, "Authenticate with remote MCP servers"). */
export interface McpAuthRejectionInput {
  readonly status: number;
  /** A configured server, a claude.ai connector, or a connector delivered to a cloud session. */
  readonly source: 'server' | 'connector' | 'cloud-connector';
  /** An `Authorization` header configured in `headers` or produced by a `headersHelper`. */
  readonly authorizationConfigured: boolean;
  /** For a connector: the 401 is claude.ai rejecting the session token. */
  readonly sessionTokenRejected?: boolean;
}

export type McpAuthState =
  | 'needs-authentication'
  | 'failed'
  | 'session-token-rejected'
  | 'reconnect-in-claude-ai'
  | 'not-a-rejection';

/** "A remote server as needing authentication when it responds with `401 Unauthorized` or `403 Forbidden`". */
const REJECTING_STATUSES: ReadonlySet<number> = new Set([401, 403]);

const UNAUTHORIZED = 401;

type Reaction = (input: McpAuthRejectionInput) => McpAuthState;

const REACTIONS: { readonly [S in McpAuthRejectionInput['source']]: Reaction } = {
  server: ({ authorizationConfigured }) =>
    authorizationConfigured ? 'failed' : 'needs-authentication',
  // "A `401` caused by claude.ai rejecting your session token": a `403` is flagged like any other.
  connector: ({ status, authorizationConfigured, sessionTokenRejected }) => {
    if (status === UNAUTHORIZED && sessionTokenRejected === true) return 'session-token-rejected';
    return authorizationConfigured ? 'failed' : 'needs-authentication';
  },
  // The session's proxy authenticates with the authorization granted in claude.ai: no sign-in flow here.
  'cloud-connector': () => 'reconnect-in-claude-ai',
};

export function mcpAuthRejection(input: McpAuthRejectionInput): McpAuthState {
  return REJECTING_STATUSES.has(input.status) ? REACTIONS[input.source](input) : 'not-a-rejection';
}

export interface StoredTokenRecovery {
  readonly first: 'refresh-and-retry' | 'connect-without-token';
  /** When `/mcp` flags the server: the retry failed, or the connection without the token was rejected too. */
  readonly flaggedWhen: 'retry-fails' | 'connection-rejected';
  /** "Its tools work while you're signed out, and the rejected token is deleted." */
  readonly deletesRejectedToken: boolean;
}

/** A stored OAuth token rejected with 401: "Your stored login has a refresh token" or not. */
export function storedTokenRecovery(login: {
  readonly refreshToken: boolean;
}): StoredTokenRecovery {
  return login.refreshToken
    ? { first: 'refresh-and-retry', flaggedWhen: 'retry-fails', deletesRejectedToken: false }
    : {
        first: 'connect-without-token',
        flaggedWhen: 'connection-rejected',
        deletesRejectedToken: true,
      };
}
