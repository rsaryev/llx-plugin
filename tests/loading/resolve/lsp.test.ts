/**
 * plugins/manifest-reference.md § Where each variable resolves (LSP servers: `command`, `args`,
 * `env`, `workspaceFolder`; exported `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`,
 * `CLAUDE_PROJECT_DIR`), § Reference a saved value (`${user_config.KEY}` in LSP server config),
 * § lspServers (defaults of `transport`, `shutdownTimeout`, `requestTimeout`, `restartOnCrash`,
 * `diagnostics`); plugins/components.md § Reference plugin paths and store data.
 *
 * The kit never starts a language server: the resolved view is what the host's LSP client reads.
 * Everything that is a runtime effect (the 60 second request timeout, killing the process, the
 * diagnostics push) is the host's; what the kit proves is the value the host receives and the
 * decisions in lsp-runtime.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  LSP_DEFAULTS,
  resolveLspServer,
  type ResolvedLspServer,
} from '../../../src/entry/loading.ts';
import { type LspServer } from '../../../src/entry/format.ts';
import { locations } from '../../support/ports.ts';
import { PATHS, scopeOf } from '../../support/mcp-scope.ts';
import { windowsLocations } from '../../support/windows-locations.ts';
import { spec } from '../../support/spec.ts';

const gopls: LspServer = { command: 'gopls', extensionToLanguage: { '.go': 'go' } };

const resolve = async (server: LspServer, scope = scopeOf()): Promise<ResolvedLspServer> => {
  const { resolved, issues } = await resolveLspServer('go', server, scope);
  expect(issues).toEqual([]);
  return resolved;
};

spec('environment.component.LSP servers', () => {
  const everywhere = '${CLAUDE_PLUGIN_ROOT}|${CLAUDE_PLUGIN_DATA}|${CLAUDE_PROJECT_DIR}';
  const expected = `${PATHS.CLAUDE_PLUGIN_ROOT}|${PATHS.CLAUDE_PLUGIN_DATA}|${PATHS.CLAUDE_PROJECT_DIR}`;

  test('resolves in command, args, env and workspaceFolder', async () => {
    const resolved = await resolve({
      ...gopls,
      command: '${CLAUDE_PLUGIN_ROOT}/bin/gopls',
      args: ['--root', everywhere],
      env: { PATHS: everywhere },
      workspaceFolder: everywhere,
    });
    expect(resolved.command).toBe(`${PATHS.CLAUDE_PLUGIN_ROOT}/bin/gopls`);
    expect(resolved.args).toEqual(['--root', expected]);
    expect(resolved.env).toEqual({ PATHS: expected });
    expect(resolved.workspaceFolder).toBe(expected);
  });

  test('resolves in no other field: initializationOptions, settings and the language map stay literal', async () => {
    const resolved = await resolve({
      ...gopls,
      extensionToLanguage: { '.go': '${CLAUDE_PLUGIN_ROOT}' },
      initializationOptions: { root: everywhere, list: ['${CLAUDE_PLUGIN_ROOT}'] },
      settings: { gopls: { dir: everywhere } },
    });
    expect(resolved.extensionToLanguage).toEqual({ '.go': '${CLAUDE_PLUGIN_ROOT}' });
    expect(resolved.initializationOptions).toEqual({
      root: everywhere,
      list: ['${CLAUDE_PLUGIN_ROOT}'],
    });
    expect(resolved.settings).toEqual({ gopls: { dir: everywhere } });
  });

  test('the process gets CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA and CLAUDE_PROJECT_DIR and nothing else', async () => {
    const resolved = await resolve({ ...gopls, env: { GOFLAGS: '-mod=mod' } });
    expect(resolved.environment).toEqual(PATHS);
    // The server's own env is its config, not the exported set, and carries no path variable.
    expect(resolved.env).toEqual({ GOFLAGS: '-mod=mod' });
  });

  test('the data folder is created for the process even when nothing references it', async () => {
    const host = locations();
    await resolve(gopls, scopeOf({ locations: host }));
    expect(host.dataCreated).toEqual(['my-plugin-acme-tools']);
  });

  test('${user_config.KEY} is substituted in the LSP fields, a sensitive value included', async () => {
    const resolved = await resolve({
      ...gopls,
      args: ['--region', '${user_config.region}'],
      env: { TOKEN: '${user_config.api_token}' },
    });
    expect(resolved.args).toEqual(['--region', 'eu']);
    expect(resolved.env).toEqual({ TOKEN: 's3cret' });
  });

  test('${VAR} of the host environment is left for the process (the docs give LSP no expansion)', async () => {
    const resolved = await resolve({ ...gopls, command: 'gopls', args: ['${DB_URL}'] });
    expect(resolved.args).toEqual(['${DB_URL}']);
  });

  test('an unknown ${user_config.KEY} stays as written with a warning', async () => {
    const { resolved, issues } = await resolveLspServer(
      'go',
      { ...gopls, args: ['${user_config.nope}'] },
      scopeOf(),
    );
    expect(resolved.args).toEqual(['${user_config.nope}']);
    expect(issues.map((found) => found.severity)).toEqual(['warning']);
    expect(issues[0]?.path).toBe('lspServers.go.args');
  });

  test('a Windows host reads forward slashes in text and native paths in the environment', async () => {
    const resolved = await resolve(
      { ...gopls, workspaceFolder: '${CLAUDE_PROJECT_DIR}' },
      scopeOf({ windows: true, locations: windowsLocations() }),
    );
    expect(resolved.workspaceFolder).toBe('C:/Users/you/app');
    expect(resolved.environment.CLAUDE_PROJECT_DIR).toBe('C:\\Users\\you\\app');
  });
});

spec('lsp.field.transport', () => {
  test('stdio when unset', async () => {
    expect((await resolve(gopls)).transport).toBe('stdio');
  });
  test('socket is accepted and every server still runs over stdio', async () => {
    expect((await resolve({ ...gopls, transport: 'socket' })).transport).toBe('stdio');
    expect((await resolve({ ...gopls, transport: 'stdio' })).transport).toBe('stdio');
  });
});

spec('lsp.field.requestTimeout', () => {
  test('defaults to 60000 milliseconds', async () => {
    expect(LSP_DEFAULTS.requestTimeoutMs).toBe(60000);
    expect((await resolve(gopls)).requestTimeoutMs).toBe(60000);
  });
  test('the declared value wins', async () => {
    expect((await resolve({ ...gopls, requestTimeout: 5000 })).requestTimeoutMs).toBe(5000);
  });
});

spec('lsp.field.shutdownTimeout', () => {
  test('when unset no timeout applies', async () => {
    expect((await resolve(gopls)).shutdownTimeoutMs).toBeUndefined();
  });
  test('the declared value is the milliseconds to wait before terminating the process', async () => {
    expect((await resolve({ ...gopls, shutdownTimeout: 1500 })).shutdownTimeoutMs).toBe(1500);
  });
});

spec('lsp.field.startupTimeout', () => {
  test('the declared value is the milliseconds to wait for startup', async () => {
    expect((await resolve({ ...gopls, startupTimeout: 20000 })).startupTimeoutMs).toBe(20000);
  });
  test('unset stays unset: the docs name no default', async () => {
    expect((await resolve(gopls)).startupTimeoutMs).toBeUndefined();
  });
});

spec('lsp.field.restartOnCrash', () => {
  test('defaults to true', async () => {
    expect(LSP_DEFAULTS.restartOnCrash).toBe(true);
    expect((await resolve(gopls)).restartOnCrash).toBe(true);
  });
  test('false is kept', async () => {
    expect((await resolve({ ...gopls, restartOnCrash: false })).restartOnCrash).toBe(false);
  });
});

spec('lsp.field.maxRestarts', () => {
  test('the declared value is kept, zero included', async () => {
    expect((await resolve({ ...gopls, maxRestarts: 3 })).maxRestarts).toBe(3);
    expect((await resolve({ ...gopls, maxRestarts: 0 })).maxRestarts).toBe(0);
  });
  test('unset stays unset (judgment J-L2: unbounded)', async () => {
    expect((await resolve(gopls)).maxRestarts).toBeUndefined();
  });
});

spec('lsp.field.diagnostics', () => {
  test('defaults to true: diagnostics are pushed into context after edits', async () => {
    expect(LSP_DEFAULTS.diagnostics).toBe(true);
    expect((await resolve(gopls)).diagnostics).toBe(true);
  });
  test('false turns the push off', async () => {
    expect((await resolve({ ...gopls, diagnostics: false })).diagnostics).toBe(false);
  });
});

spec('lsp.field.initializationOptions', () => {
  test('are handed to the host untouched, for the initialize request', async () => {
    const initializationOptions = { usePlaceholders: true };
    expect((await resolve({ ...gopls, initializationOptions })).initializationOptions).toEqual(
      initializationOptions,
    );
  });
});

spec('lsp.field.settings', () => {
  test('are handed to the host untouched, for workspace/didChangeConfiguration', async () => {
    const settings = { gopls: { staticcheck: true } };
    expect((await resolve({ ...gopls, settings })).settings).toEqual(settings);
  });
});

spec('lsp.field.workspaceFolder', () => {
  test('is resolved to the path the server gets', async () => {
    expect(
      (await resolve({ ...gopls, workspaceFolder: '${CLAUDE_PROJECT_DIR}/backend' }))
        .workspaceFolder,
    ).toBe('/work/app/backend');
  });
  test('unset stays unset: the host picks the workspace', async () => {
    expect((await resolve(gopls)).workspaceFolder).toBeUndefined();
  });
});

spec('lsp.field.args', () => {
  test('are resolved one by one, in order; none declared is an empty list', async () => {
    expect((await resolve({ ...gopls, args: ['serve', '${CLAUDE_PLUGIN_DATA}'] })).args).toEqual([
      'serve',
      PATHS.CLAUDE_PLUGIN_DATA,
    ]);
    expect((await resolve(gopls)).args).toEqual([]);
  });
});

spec('lsp.field.env', () => {
  test('is resolved value by value; none declared is empty', async () => {
    expect((await resolve({ ...gopls, env: { A: '${CLAUDE_PLUGIN_ROOT}/x' } })).env).toEqual({
      A: `${PATHS.CLAUDE_PLUGIN_ROOT}/x`,
    });
    expect((await resolve(gopls)).env).toEqual({});
  });
});

spec('lsp.field.command', () => {
  test('is resolved, and the process line is never built by the kit', async () => {
    const resolved = await resolve({
      ...gopls,
      command: '${CLAUDE_PLUGIN_ROOT}/bin/gopls',
      args: ['serve'],
    });
    expect(resolved.command).toBe('/plugins/my-plugin@acme-tools/bin/gopls');
    expect(resolved.args).toEqual(['serve']);
  });
});

spec('lsp.field.extensionToLanguage', () => {
  test('is handed to the host as declared, in order', async () => {
    const extensionToLanguage = { '.ts': 'typescript', '.tsx': 'typescriptreact' };
    const resolved = await resolve({ command: 'tsserver', extensionToLanguage });
    expect(Object.entries(resolved.extensionToLanguage)).toEqual(
      Object.entries(extensionToLanguage),
    );
  });
});

describe('the resolved server (judgments)', () => {
  test('carries the name the plugin gave it', async () => {
    expect((await resolve(gopls)).name).toBe('go');
  });
  test('the same declaration resolves the same way twice', async () => {
    expect(await resolve(gopls)).toEqual(await resolve(gopls));
  });
});
