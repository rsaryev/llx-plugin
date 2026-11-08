/**
 * mcp.md § Authenticate with remote MCP servers (which 401 or 403 flags a server, what a stored token
 * that is rejected does), § Use a fixed OAuth callback port, § Use pre-configured OAuth credentials
 * (the `oauth` object: `clientId`, `callbackPort`; the redirect URI `http://localhost:PORT/callback`;
 * the secret is not part of the config), § Override OAuth metadata discovery (`authServerMetadataUrl`
 * over `https://`), § Restrict OAuth scopes (`oauth.scopes`, one space-separated string),
 * § Use OAuth with a server behind an authenticating proxy (the proxy's header goes with the OAuth
 * requests; a configured `Authorization` header means no OAuth). Wording of the problems the docs do
 * not quote is a judgment (spec/judgments.md) and is asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  mcpAuthRejection,
  mcpOAuthDiscovery,
  mcpOAuthRedirectUri,
  planMcpOAuth,
  readMcpOAuth,
  requestedOAuthScopes,
  storedTokenRecovery,
  type PluginMcpServer,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const read = (raw: unknown) => readMcpOAuth('my-server', raw, '.mcp.json');

spec('mcp.behavior.Use a fixed OAuth callback port', () => {
  test('callbackPort on its own fixes the port and leaves the client to dynamic registration', () => {
    const { oauth, issues } = read({ callbackPort: 8080 });
    expect(issues).toEqual([]);
    expect(oauth).toEqual({ callbackPort: 8080 });
    expect(oauth?.clientId).toBeUndefined();
  });

  test('the redirect URI is http://localhost:PORT/callback, localhost and not 127.0.0.1', () => {
    expect(mcpOAuthRedirectUri(8080)).toBe('http://localhost:8080/callback');
  });

  test('a port that is not a whole number of 1 to 65535 is refused, as it could never be a redirect URI', () => {
    for (const port of [0, -1, 65536, 80.5, '8080', null]) {
      const { oauth, issues } = read({ callbackPort: port });
      expect(oauth).toBeUndefined();
      expect(issues).toHaveLength(1);
      expect(issues[0]?.severity).toBe('error');
      expect(issues[0]?.message).toContain('oauth.callbackPort');
    }
    expect(read({ callbackPort: 65535 }).oauth).toEqual({ callbackPort: 65535 });
  });
});

spec('mcp.behavior.Use pre-configured OAuth credentials', () => {
  test('the add-json example: clientId and callbackPort read as the pre-registered client', () => {
    const { oauth, issues } = read({ clientId: 'your-client-id', callbackPort: 8080 });
    expect(issues).toEqual([]);
    expect(oauth).toEqual({ clientId: 'your-client-id', callbackPort: 8080 });
  });

  test('the secret is not part of the configuration: a clientSecret key is warned about and never kept', () => {
    const { oauth, issues } = read({ clientId: 'id', clientSecret: 'shh' });
    expect(oauth).toEqual({ clientId: 'id' });
    expect(JSON.stringify(oauth)).not.toContain('shh');
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: '.mcp.json',
        message:
          'MCP server "my-server" has "oauth.clientSecret", which is not a configuration field: the client secret is given only when the server is added (--client-secret, MCP_CLIENT_SECRET)',
      },
    ]);
  });

  test('a clientId that is not text, or is empty, is refused', () => {
    for (const clientId of [5, '', null, ['a']]) {
      const { oauth, issues } = read({ clientId });
      expect(oauth).toBeUndefined();
      expect(issues[0]?.message).toContain('oauth.clientId');
    }
  });

  test('oauth that is not an object is refused', () => {
    for (const raw of ['id', ['clientId'], null, 8080]) {
      expect(read(raw).oauth).toBeUndefined();
      expect(read(raw).issues[0]?.message).toBe(
        'Invalid MCP server config for "my-server": oauth: expected an object',
      );
    }
  });
});

spec('mcp.behavior.Override OAuth metadata discovery', () => {
  const server = 'https://mcp.example.com/mcp';

  test('the docs example reads: an https:// authServerMetadataUrl', () => {
    const url = 'https://auth.example.com/.well-known/openid-configuration';
    expect(read({ authServerMetadataUrl: url })).toEqual({
      oauth: { authServerMetadataUrl: url },
      issues: [],
    });
  });

  test('"The URL must use https://": http, other schemes and text that is no URL are refused', () => {
    for (const url of [
      'http://auth.example.com/meta',
      'ftp://auth.example.com/meta',
      'auth.example.com/meta',
      '',
      7,
    ]) {
      const { oauth, issues } = read({ authServerMetadataUrl: url });
      expect(oauth).toBeUndefined();
      expect(issues[0]?.message).toContain('oauth.authServerMetadataUrl');
    }
  });

  test('by default RFC 9728 protected resource metadata is tried first, then RFC 8414 authorization server metadata', () => {
    expect(mcpOAuthDiscovery(server, undefined)).toEqual({
      kind: 'chain',
      urls: [
        'https://mcp.example.com/.well-known/oauth-protected-resource',
        'https://mcp.example.com/.well-known/oauth-authorization-server',
      ],
    });
  });

  test('authServerMetadataUrl bypasses the default discovery chain', () => {
    const url = 'https://auth.example.com/.well-known/openid-configuration';
    expect(mcpOAuthDiscovery(server, { authServerMetadataUrl: url })).toEqual({
      kind: 'configured',
      url,
    });
  });
});

spec('mcp.behavior.Restrict OAuth scopes', () => {
  const discovered = { source: 'discovered', scopesSupported: ['a', 'b', 'c'] } as const;
  const configured = { source: 'configured', scopesSupported: ['x', 'y'] } as const;

  test('the docs example: one space-separated string', () => {
    const scopes = 'channels:read chat:write search:read';
    expect(read({ scopes })).toEqual({ oauth: { scopes }, issues: [] });
  });

  test('a list or an empty string is refused: the value is a single string (RFC 6749 section 3.3)', () => {
    for (const scopes of [['channels:read'], '', 5]) {
      const { oauth, issues } = read({ scopes });
      expect(oauth).toBeUndefined();
      expect(issues[0]?.message).toContain('oauth.scopes');
    }
  });

  test('oauth.scopes takes precedence over the scopes of both discovered and configured metadata', () => {
    expect(requestedOAuthScopes({ scopes: 'chat:write' }, discovered)).toBe('chat:write');
    expect(requestedOAuthScopes({ scopes: 'chat:write' }, configured)).toBe('chat:write');
  });

  test('unset: discovered metadata does not put its whole catalog in the request', () => {
    expect(requestedOAuthScopes({}, discovered)).toBeUndefined();
    expect(requestedOAuthScopes(undefined, discovered)).toBeUndefined();
  });

  test('unset: metadata of a configured authServerMetadataUrl supplies its scopes_supported', () => {
    expect(requestedOAuthScopes({ authServerMetadataUrl: 'https://a.test/m' }, configured)).toBe(
      'x y',
    );
  });

  test('offline_access is appended to the pinned scopes when the server advertises it, once', () => {
    const advertises = { source: 'discovered', scopesSupported: ['a', 'offline_access'] } as const;
    expect(requestedOAuthScopes({ scopes: 'chat:write' }, advertises)).toBe(
      'chat:write offline_access',
    );
    expect(requestedOAuthScopes({ scopes: 'chat:write offline_access' }, advertises)).toBe(
      'chat:write offline_access',
    );
    expect(requestedOAuthScopes({ scopes: 'chat:write' }, discovered)).toBe('chat:write');
  });
});

spec('mcp.behavior.Use OAuth with a server behind an authenticating proxy', () => {
  const http: PluginMcpServer = {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
    headers: { 'X-Gateway-Key': 'k' },
  };

  test("the proxy's header goes with the OAuth requests, whether configured, or produced by a headersHelper", () => {
    expect(planMcpOAuth(http, { headers: { 'X-Gateway-Key': 'k' } })).toEqual({
      oauth: true,
      headers: { 'X-Gateway-Key': 'k' },
    });
    const fromHelper = { 'X-Gateway-Key': 'from-helper' };
    expect(planMcpOAuth({ ...http, headersHelper: './h.sh' }, { headers: fromHelper })).toEqual({
      oauth: true,
      headers: fromHelper,
    });
  });

  test('a configured Authorization header is the server credential and no OAuth follows, whatever its letter case', () => {
    for (const name of ['Authorization', 'authorization', 'AUTHORIZATION']) {
      expect(planMcpOAuth(http, { headers: { [name]: 'Bearer t', 'X-Gateway-Key': 'k' } })).toEqual(
        { oauth: false, reason: 'authorization-header' },
      );
    }
  });

  test('OAuth works with HTTP and SSE servers only: not stdio, not WebSocket', () => {
    const sse: PluginMcpServer = { type: 'sse', url: 'https://mcp.example.com/sse' };
    expect(planMcpOAuth(sse, { headers: {} })).toEqual({ oauth: true, headers: {} });
    const ws: PluginMcpServer = { type: 'ws', url: 'wss://mcp.example.com/socket' };
    expect(planMcpOAuth(ws, { headers: {} })).toEqual({ oauth: false, reason: 'transport' });
    expect(planMcpOAuth({ command: 'node' }, { headers: {} })).toEqual({
      oauth: false,
      reason: 'transport',
    });
  });

  test('the oauth block of the entry rides along', () => {
    expect(planMcpOAuth(http, { headers: {}, oauth: { callbackPort: 8080 } })).toEqual({
      oauth: true,
      headers: {},
      config: { callbackPort: 8080 },
    });
  });
});

spec('mcp.behavior.Authenticate with remote MCP servers', () => {
  const base = { status: 401, source: 'server', authorizationConfigured: false } as const;

  test('401 Unauthorized and 403 Forbidden both flag a server you have not signed in to', () => {
    expect(mcpAuthRejection(base)).toBe('needs-authentication');
    expect(mcpAuthRejection({ ...base, status: 403 })).toBe('needs-authentication');
  });

  test('another status is no rejection of the credential', () => {
    for (const status of [200, 404, 500]) {
      expect(mcpAuthRejection({ ...base, status })).toBe('not-a-rejection');
    }
  });

  test('a configured Authorization header (headers or headersHelper) that is rejected reports the connection as failed, not OAuth', () => {
    for (const status of [401, 403]) {
      expect(mcpAuthRejection({ ...base, status, authorizationConfigured: true })).toBe('failed');
    }
  });

  test("a claude.ai connector whose 401 is claude.ai rejecting your session token is not flagged: re-authorizing can't fix your login", () => {
    const connector = { ...base, source: 'connector' } as const;
    expect(mcpAuthRejection({ ...connector, sessionTokenRejected: true })).toBe(
      'session-token-rejected',
    );
    expect(mcpAuthRejection(connector)).toBe('needs-authentication');
  });

  test('a connector delivered to a cloud session runs no sign-in flow: reconnect it in claude.ai', () => {
    expect(mcpAuthRejection({ ...base, source: 'cloud-connector' })).toBe('reconnect-in-claude-ai');
  });

  test('a stored login with a refresh token is refreshed and the request retried once; without one the server is tried once without the token', () => {
    expect(storedTokenRecovery({ refreshToken: true })).toEqual({
      first: 'refresh-and-retry',
      flaggedWhen: 'retry-fails',
      deletesRejectedToken: false,
    });
    expect(storedTokenRecovery({ refreshToken: false })).toEqual({
      first: 'connect-without-token',
      flaggedWhen: 'connection-rejected',
      deletesRejectedToken: true,
    });
  });
});

describe('what the docs leave open', () => {
  test('keys of oauth the docs do not list are warned about and dropped', () => {
    const { oauth, issues } = read({ callbackPort: 8080, flavor: 'x' });
    expect(oauth).toEqual({ callbackPort: 8080 });
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
    expect(issues[0]?.message).toContain('oauth.flavor');
  });

  test('a missing oauth value reads as nothing, without an issue', () => {
    expect(readMcpOAuth('s', undefined, 'f')).toEqual({ oauth: undefined, issues: [] });
  });
});
