/**
 * mcp.md § Credential variables that read as empty, through the expander of a server of the settings
 * scopes: a covered name reads as empty in a remote `url` and `headers` (set or not, a default
 * ignored, no warning), expands in a stdio server, and a debug line names a covered variable the user
 * set. The list itself is in credential-env.test.ts.
 */
import { expect, test } from 'bun:test';
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';
import { expandMcpServer, type EnvLookup } from '../../src/format/mcp-env.ts';
import { spec } from '../support/spec.ts';

const lookupOf =
  (values: Readonly<Record<string, string>>): EnvLookup =>
  (name) =>
    Object.hasOwn(values, name) ? values[name] : undefined;

const remote = (
  headers: Record<string, string>,
  url = 'https://x.example/mcp',
): PluginMcpServer => ({
  type: 'http',
  url,
  headers,
});

spec('mcpSettings.behavior.Credential variables that read as empty', () => {
  test('Bearer ${ANTHROPIC_AUTH_TOKEN} sends `Bearer ` with no credential', () => {
    const out = expandMcpServer(
      's',
      remote({ Authorization: 'Bearer ${ANTHROPIC_AUTH_TOKEN}' }),
      lookupOf({ ANTHROPIC_AUTH_TOKEN: 'sk-secret' }),
    );
    expect(out.server).toMatchObject({ headers: { Authorization: 'Bearer ' } });
    expect(JSON.stringify(out.server)).not.toContain('sk-secret');
  });

  test('every covered name reads as empty in url and headers', () => {
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK',
      'HTTPS_PROXY',
      'NPM_TOKEN',
    ]) {
      const out = expandMcpServer(
        's',
        remote({ H: `\${${name}}` }, `https://x.example/\${${name}}`),
        lookupOf({ [name]: 'secret' }),
      );
      expect(out.server).toEqual({ type: 'http', url: 'https://x.example/', headers: { H: '' } });
    }
  });

  test('a covered name reads as empty whether or not it is set, and a default is ignored', () => {
    const header = remote({ H: '${NPM_TOKEN:-fallback}' });
    expect(expandMcpServer('s', header, lookupOf({})).server).toMatchObject({ headers: { H: '' } });
    expect(expandMcpServer('s', header, lookupOf({ NPM_TOKEN: 't' })).server).toMatchObject({
      headers: { H: '' },
    });
  });

  test('a provider base URL still expands, and so does a name outside the set', () => {
    const out = expandMcpServer(
      's',
      remote({ K: '${API_KEY}' }, '${ANTHROPIC_BASE_URL}/mcp'),
      lookupOf({ ANTHROPIC_BASE_URL: 'https://proxy.example', API_KEY: 'mine' }),
    );
    expect(out.server).toMatchObject({ url: 'https://proxy.example/mcp', headers: { K: 'mine' } });
  });

  test('a covered name expands in a stdio server, which is local', () => {
    const out = expandMcpServer(
      's',
      { command: 'srv', env: { NPM_TOKEN: '${NPM_TOKEN}' }, args: ['${HTTPS_PROXY}'] },
      lookupOf({ NPM_TOKEN: 'tok', HTTPS_PROXY: 'http://proxy' }),
    );
    expect(out.server).toEqual({
      command: 'srv',
      env: { NPM_TOKEN: 'tok' },
      args: ['http://proxy'],
    });
  });

  test('a covered variable the user has set is named in a debug line; an unset one is not', () => {
    const header = remote({ Authorization: 'Bearer ${ANTHROPIC_AUTH_TOKEN}' });
    const set = expandMcpServer('s', header, lookupOf({ ANTHROPIC_AUTH_TOKEN: 'x' }));
    expect(set.debug).toHaveLength(1);
    expect(set.debug[0]).toContain('ANTHROPIC_AUTH_TOKEN');
    expect(set.debug[0]).toContain('never expanded toward a remote server');
    expect(expandMcpServer('s', header, lookupOf({})).debug).toEqual([]);
  });

  test('the debug line is for url and headers, not for a stdio server, and never holds the value', () => {
    const local = expandMcpServer('s', { command: '${NPM_TOKEN}' }, lookupOf({ NPM_TOKEN: 'tok' }));
    expect(local.debug).toEqual([]);
    const value = 'sk-v4lue-9f2';
    const remoteOut = expandMcpServer(
      's',
      remote({ A: '${NPM_TOKEN}', B: '${NPM_TOKEN}' }),
      lookupOf({ NPM_TOKEN: value }),
    );
    expect(remoteOut.debug).toHaveLength(1);
    expect(remoteOut.debug[0]).toContain('NPM_TOKEN');
    expect(remoteOut.debug[0]).not.toContain(value);
  });
});
