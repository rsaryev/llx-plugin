/**
 * plugins/manifest-reference.md § lspServers (`restartOnCrash`: "Whether to restart the server after
 * it crashes. Defaults to `true`. Set to `false` to leave a crashed server stopped instead of
 * restarting it"; `maxRestarts`: "Restart attempts before giving up, zero or more"; `initializationOptions`:
 * "Options sent in the initialize request"; `settings`: "Settings sent by
 * `workspace/didChangeConfiguration`"; `extensionToLanguage`: "Map of file extension to LSP language
 * ID"); plugins/components.md § LSP servers ("each file extension gets one server": "when two enabled
 * servers claim the same extension, the first registered handles those files and the other isn't
 * used for them"; the warning `LSP server "<name>" is not used for <ext> files`).
 *
 * Restarting, timeouts, the initialize request and the settings push are the host's LSP client. The
 * kit decides the pure parts: whether a crash is restarted, which server and language ID a file
 * gets, and the content of the two messages. Each is asserted here as a decision over data.
 */
import { describe, expect, test } from 'bun:test';
import {
  didChangeConfigurationOf,
  initializeOptionsOf,
  languageIdFor,
  lspExtensionConflicts,
  lspRestartDecision,
  type LspServer,
} from '../../../src/index.ts';
import { spec } from '../../support/spec.ts';

spec('lsp.field.restartOnCrash', () => {
  test('defaults to true: a crashed server restarts', () => {
    expect(lspRestartDecision({}, 0)).toBe('restart');
    expect(lspRestartDecision({ restartOnCrash: true }, 0)).toBe('restart');
  });
  test('false leaves a crashed server stopped', () => {
    expect(lspRestartDecision({ restartOnCrash: false }, 0)).toBe('stay-stopped');
  });
  test('false stays stopped whatever maxRestarts allows', () => {
    expect(lspRestartDecision({ restartOnCrash: false, maxRestarts: 10 }, 0)).toBe('stay-stopped');
  });
});

spec('lsp.field.maxRestarts', () => {
  test('restarts until the attempts are used, then gives up', () => {
    const server = { maxRestarts: 2 };
    expect([0, 1, 2, 3].map((made) => lspRestartDecision(server, made))).toEqual([
      'restart',
      'restart',
      'stay-stopped',
      'stay-stopped',
    ]);
  });
  test('zero attempts means the first crash is final', () => {
    expect(lspRestartDecision({ maxRestarts: 0 }, 0)).toBe('stay-stopped');
  });
  test('only counts while restartOnCrash is on', () => {
    expect(lspRestartDecision({ restartOnCrash: true, maxRestarts: 1 }, 1)).toBe('stay-stopped');
  });
});

describe('maxRestarts unset (judgment J-L2)', () => {
  test('is unbounded while restartOnCrash is on: the docs give no default', () => {
    expect(lspRestartDecision({}, 0)).toBe('restart');
    expect(lspRestartDecision({}, 1000)).toBe('restart');
  });
});

spec('lsp.field.initializationOptions', () => {
  test('are sent in the initialize request, as written', () => {
    const initializationOptions = { usePlaceholders: true, hints: { assignVariableTypes: true } };
    expect(initializeOptionsOf({ initializationOptions })).toEqual({ initializationOptions });
  });
  test('without them the request carries no initializationOptions', () => {
    expect(initializeOptionsOf({})).toEqual({});
    expect('initializationOptions' in initializeOptionsOf({})).toBe(false);
  });
  test('a JSON null is a value and is sent', () => {
    expect(initializeOptionsOf({ initializationOptions: null })).toEqual({
      initializationOptions: null,
    });
  });
});

spec('lsp.field.settings', () => {
  test('are sent by workspace/didChangeConfiguration', () => {
    const settings = { gopls: { staticcheck: true } };
    expect(didChangeConfigurationOf({ settings })).toEqual({
      method: 'workspace/didChangeConfiguration',
      params: { settings },
    });
  });
  test('without them no notification is sent (judgment)', () => {
    expect(didChangeConfigurationOf({})).toBeUndefined();
  });
});

spec('lsp.field.extensionToLanguage', () => {
  const servers: Record<string, Pick<LspServer, 'extensionToLanguage'>> = {
    go: { extensionToLanguage: { '.go': 'go' } },
    ts: { extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescriptreact' } },
  };
  test('a file gets the server and the language ID of its extension', () => {
    expect(languageIdFor(servers, '/work/app/main.go')).toEqual({ server: 'go', languageId: 'go' });
    expect(languageIdFor(servers, 'src/App.tsx')).toEqual({
      server: 'ts',
      languageId: 'typescriptreact',
    });
  });
  test('a file of no declared extension gets none', () => {
    expect(languageIdFor(servers, 'README.md')).toBeUndefined();
    expect(languageIdFor(servers, 'Makefile')).toBeUndefined();
  });
  test('the keys start with a dot, so ".go" is not matched by a name that merely ends in go', () => {
    expect(languageIdFor(servers, 'cargo')).toBeUndefined();
    expect(languageIdFor(servers, 'ago')).toBeUndefined();
  });
  test('when two servers claim an extension the first registered handles it', () => {
    const both = {
      first: { extensionToLanguage: { '.py': 'python' } },
      second: { extensionToLanguage: { '.py': 'python3' } },
    };
    expect(languageIdFor(both, 'a.py')).toEqual({ server: 'first', languageId: 'python' });
  });
});

const claiming = (...extensions: string[]) => ({
  extensionToLanguage: Object.fromEntries(extensions.map((each) => [each, 'x'])),
});

describe('extension conflicts (components.md, "LSP servers")', () => {
  test('the server that does not handle an extension gets the documented warning', () => {
    const issues = lspExtensionConflicts({
      first: claiming('.py', '.pyi'),
      second: claiming('.py'),
    });
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'second',
        message: 'LSP server "second" is not used for .py files',
      },
    ]);
  });
  test('two plugins that share a server name are told apart by the qualified key', () => {
    const servers = {
      'alpha:go': { extensionToLanguage: { '.go': 'go' } },
      'beta:go': { extensionToLanguage: { '.go': 'golang' } },
    };
    expect(languageIdFor(servers, 'main.go')).toEqual({ server: 'alpha:go', languageId: 'go' });
    expect(lspExtensionConflicts(servers)).toEqual([
      {
        severity: 'warning',
        path: 'beta:go',
        message: 'LSP server "beta:go" is not used for .go files',
      },
    ]);
  });
  test('no conflict, no warning', () => {
    expect(lspExtensionConflicts({ a: claiming('.go'), b: claiming('.rs') })).toEqual([]);
  });
});

describe('file names (judgments)', () => {
  const servers = {
    a: { extensionToLanguage: { '.ts': 'typescript' } },
    dts: { extensionToLanguage: { '.d.ts': 'typescript-declaration' } },
  };
  test('the extension is matched case-sensitively, as written', () => {
    expect(languageIdFor(servers, 'x.TS')).toBeUndefined();
  });
  test('a Windows path is read by its last segment', () => {
    expect(languageIdFor(servers, 'C:\\work\\app\\main.ts')).toEqual({
      server: 'a',
      languageId: 'typescript',
    });
  });
  test('the longest matching extension wins over a shorter one, wherever its server is', () => {
    expect(languageIdFor(servers, 'types/index.d.ts')).toEqual({
      server: 'dts',
      languageId: 'typescript-declaration',
    });
  });
  test('a dotfile that is only an extension has none', () => {
    expect(languageIdFor(servers, '.ts')).toBeUndefined();
  });
});
