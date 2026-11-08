/**
 * plugins/components.md § LSP servers; code-intelligence.md § Add a language without an official
 * plugin; plugins/troubleshooting.md § Language server doesn't start. The host's LSP client owns
 * process lookup and the protocol; the kit plans a config's process and reports a missing binary.
 */
import { expect, test } from 'bun:test';
import { readLspConfig } from '../../../src/format/lsp-config.ts';
import {
  languageIdFor,
  planLspStartup,
  resolveLspServer,
} from '../../../src/loading/resolve/index.ts';
import { scopeOf } from '../../support/mcp-scope.ts';
import { spec } from '../../support/spec.ts';

spec(
  ['lsp.components.LSP servers', 'lsp.intelligence.Add a language without an official plugin'],
  () => {
    test('a plugin can describe any language server without a registry entry or bundled binary', async () => {
      const { servers, issues } = readLspConfig(
        {
          custom: {
            command: 'custom-language-server',
            args: ['--stdio'],
            extensionToLanguage: { '.custom': 'custom' },
            transport: 'socket',
            startupTimeout: 10_000,
            env: { LIBRARY: '${CLAUDE_PLUGIN_ROOT}/lib' },
          },
        },
        '.lsp.json',
      );
      expect(issues).toEqual([]);
      const configured = servers['custom'];
      if (!configured) throw new Error('custom server did not parse');
      const { resolved } = await resolveLspServer('custom', configured, scopeOf());
      expect(languageIdFor(servers, '/work/file.custom')).toEqual({
        server: 'custom',
        languageId: 'custom',
      });
      expect(
        planLspStartup(resolved, { executableAvailable: true, cwd: '/work' }).process,
      ).toMatchObject({
        spec: { form: 'exec', command: 'custom-language-server', args: ['--stdio'] },
        cwd: '/work',
        env: { LIBRARY: '/plugins/my-plugin@acme-tools/lib' },
        transport: 'stdio',
        startupTimeoutMs: 10_000,
      });
    });
  },
);

spec("lsp.troubleshooting.Language server doesn't start", () => {
  test('a binary missing from PATH is reported, not automatically installed or started', async () => {
    const { resolved } = await resolveLspServer(
      'custom',
      { command: 'missing-server', extensionToLanguage: { '.custom': 'custom' } },
      scopeOf(),
    );
    const plan = planLspStartup(resolved, { executableAvailable: false, cwd: '/work' });
    expect(plan.process).toBeUndefined();
    expect(plan.issues[0]?.message).toStartWith('Executable not found in $PATH');
  });
});
