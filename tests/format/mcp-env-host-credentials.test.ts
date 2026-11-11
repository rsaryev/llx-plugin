/**
 * Judgment (spec/judgments.md, `src/format/mcp-env.ts`, `McpExpansionOptions.readsAsEmpty`): a host
 * stricter than Claude Code names more variables that read as empty toward a remote server. mcp.md §
 * Credential variables that read as empty gives the rule the extra names follow; the docs name no
 * host option, so this is tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { expandMcpServer, type EnvLookup } from '../../src/format/mcp-env.ts';

const lookup: EnvLookup = (name) =>
  ({ MY_SERVICE_PASS: 'hunter2', ANTHROPIC_AUTH_TOKEN: 'sk', PLAIN: 'p' })[name];
const wider = { readsAsEmpty: (name: string) => name.endsWith('_PASS') };

describe('expandMcpServer: a host widens the names read as empty toward a remote server', () => {
  test('a host name reads as empty in url and headers, with its debug line', () => {
    const out = expandMcpServer(
      's',
      { type: 'http', url: 'https://x.example/${PLAIN}', headers: { A: '${MY_SERVICE_PASS:-d}' } },
      lookup,
      wider,
    );
    expect(out.server).toEqual({ type: 'http', url: 'https://x.example/p', headers: { A: '' } });
    expect(out.debug).toHaveLength(1);
    expect(out.debug[0]).toContain('MY_SERVICE_PASS');
  });

  test('the kit list still applies: the option widens, never narrows', () => {
    const out = expandMcpServer(
      's',
      { type: 'sse', url: 'https://x.example/', headers: { A: '${ANTHROPIC_AUTH_TOKEN}' } },
      lookup,
      { readsAsEmpty: () => false },
    );
    expect(out.server).toMatchObject({ headers: { A: '' } });
  });

  test('a stdio server expands a host name as written', () => {
    const out = expandMcpServer(
      's',
      { command: 'srv', args: ['${MY_SERVICE_PASS}'] },
      lookup,
      wider,
    );
    expect(out.server).toEqual({ command: 'srv', args: ['hunter2'] });
  });
});
