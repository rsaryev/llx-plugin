/**
 * plugins/manifest-reference.md § lspServers ("Each server config is a strict object with these
 * fields. An unknown key fails validation." and the field table).
 *
 * The SDK has no LSP config type (checked in sdk.d.ts), so the table is the only source. One spec
 * block per field row; each asserts what the reader accepts and refuses. The defaults are in
 * tests/loading/resolve/lsp.test.ts, the maps and their merge in lsp-sources.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { LSP_FIELDS, readLspServer, type LspServer } from '../../src/entry/format.ts';
import { spec } from '../support/spec.ts';

const gopls = { command: 'gopls', extensionToLanguage: { '.go': 'go' } };

const read = (config: unknown) => readLspServer('go', config, '.lsp.json');
const accepted = (config: unknown): LspServer | undefined => read(config).server;
const refusal = (config: unknown): string => {
  const { server, issues } = read(config);
  expect(server).toBeUndefined();
  expect(issues).toHaveLength(1);
  expect(issues[0]?.severity).toBe('error');
  return issues[0]?.message ?? '';
};

describe('the documented fields', () => {
  test('LSP_FIELDS lists the fourteen rows of the table', () => {
    const listed: readonly string[] = LSP_FIELDS;
    expect(listed.toSorted()).toEqual(
      [
        'args',
        'command',
        'diagnostics',
        'env',
        'extensionToLanguage',
        'initializationOptions',
        'maxRestarts',
        'requestTimeout',
        'restartOnCrash',
        'settings',
        'shutdownTimeout',
        'startupTimeout',
        'transport',
        'workspaceFolder',
      ].toSorted(),
    );
  });

  test('the example of the table reads as written', () => {
    expect(accepted({ ...gopls, args: ['serve'] })).toEqual({ ...gopls, args: ['serve'] });
  });

  test('every field together reads back unchanged', () => {
    const full = {
      ...gopls,
      args: ['serve', '-rpc.trace'],
      transport: 'socket' as const,
      env: { GOFLAGS: '-mod=mod' },
      initializationOptions: { usePlaceholders: true },
      settings: { gopls: { staticcheck: true } },
      workspaceFolder: '/work/app',
      startupTimeout: 5000,
      shutdownTimeout: 2000,
      requestTimeout: 30000,
      restartOnCrash: false,
      maxRestarts: 0,
      diagnostics: false,
    };
    expect(accepted(full)).toEqual(full);
  });
});

spec('lsp.field.command', () => {
  test('is required', () => {
    expect(refusal({ extensionToLanguage: { '.go': 'go' } })).toContain('command');
  });
  test('is a string', () => {
    expect(refusal({ ...gopls, command: 7 })).toContain('command');
  });
  test('has no spaces: arguments go in args', () => {
    expect(refusal({ ...gopls, command: 'gopls serve' })).toContain('command');
    expect(accepted({ ...gopls, command: 'gopls', args: ['serve'] })).toBeDefined();
  });
  test('may have spaces when the value starts with "/"', () => {
    const command = '/Applications/My Tools/bin/gopls';
    expect(accepted({ ...gopls, command })?.command).toBe(command);
  });
  test('a ${CLAUDE_PLUGIN_ROOT} path without spaces is a valid command', () => {
    const command = '${CLAUDE_PLUGIN_ROOT}/bin/server';
    expect(accepted({ ...gopls, command })?.command).toBe(command);
  });
});

spec('lsp.field.extensionToLanguage', () => {
  test('is required', () => {
    expect(refusal({ command: 'gopls' })).toContain('extensionToLanguage');
  });
  test('needs at least one entry', () => {
    expect(refusal({ command: 'gopls', extensionToLanguage: {} })).toContain('extensionToLanguage');
  });
  test('every key starts with a dot', () => {
    const message = refusal({ command: 'gopls', extensionToLanguage: { '.go': 'go', go: 'go' } });
    expect(message).toContain('extensionToLanguage');
    expect(message).toContain('no dot in "go"');
  });
  test('every offending key is named, and a dotted key alone is accepted', () => {
    const message = refusal({
      command: 'gopls',
      extensionToLanguage: { '.go': 'go', go: 'go', mod: 'gomod' },
    });
    expect(message).toContain('no dot in "go", "mod"');
    expect(
      accepted({ ...gopls, extensionToLanguage: { '.go': 'go' } })?.extensionToLanguage,
    ).toEqual({ '.go': 'go' });
  });
  test('maps extension to language ID, both strings', () => {
    expect(refusal({ command: 'gopls', extensionToLanguage: { '.go': 3 } })).toContain(
      'extensionToLanguage',
    );
    expect(refusal({ command: 'gopls', extensionToLanguage: ['.go'] })).toContain(
      'extensionToLanguage',
    );
    const two = { '.ts': 'typescript', '.tsx': 'typescriptreact' };
    expect(
      accepted({ command: 'tsserver', extensionToLanguage: two })?.extensionToLanguage,
    ).toEqual(two);
  });
});

spec('lsp.field.args', () => {
  test('is an array of strings', () => {
    expect(accepted({ ...gopls, args: ['serve', '--verbose'] })?.args).toEqual([
      'serve',
      '--verbose',
    ]);
    expect(refusal({ ...gopls, args: 'serve' })).toContain('args');
    expect(refusal({ ...gopls, args: ['serve', 1] })).toContain('args');
  });
});

spec('lsp.field.transport', () => {
  test('accepts stdio and socket', () => {
    expect(accepted({ ...gopls, transport: 'stdio' })?.transport).toBe('stdio');
    expect(accepted({ ...gopls, transport: 'socket' })?.transport).toBe('socket');
  });
  test('accepts nothing else', () => {
    expect(refusal({ ...gopls, transport: 'pipe' })).toContain('transport');
    expect(refusal({ ...gopls, transport: 1 })).toContain('transport');
  });
});

spec('lsp.field.env', () => {
  test('is a map of strings', () => {
    expect(accepted({ ...gopls, env: { GOFLAGS: '-mod=mod' } })?.env).toEqual({
      GOFLAGS: '-mod=mod',
    });
    expect(refusal({ ...gopls, env: { GOFLAGS: 1 } })).toContain('env');
    expect(refusal({ ...gopls, env: ['A=1'] })).toContain('env');
  });
});

spec('lsp.field.initializationOptions', () => {
  test('is any JSON value, kept as written', () => {
    const options = { usePlaceholders: true, nested: { list: [1, 'two', null] } };
    expect(accepted({ ...gopls, initializationOptions: options })?.initializationOptions).toEqual(
      options,
    );
  });
});

spec('lsp.field.settings', () => {
  test('is any JSON value, kept as written', () => {
    const settings = { gopls: { staticcheck: true, analyses: { unusedparams: false } } };
    expect(accepted({ ...gopls, settings })?.settings).toEqual(settings);
  });
});

spec('lsp.field.workspaceFolder', () => {
  test('is a string', () => {
    expect(
      accepted({ ...gopls, workspaceFolder: '${CLAUDE_PROJECT_DIR}/app' })?.workspaceFolder,
    ).toBe('${CLAUDE_PROJECT_DIR}/app');
    expect(refusal({ ...gopls, workspaceFolder: 3 })).toContain('workspaceFolder');
  });
});

describe.each(['startupTimeout', 'shutdownTimeout', 'requestTimeout'] as const)('%s', (field) => {
  const id = `lsp.field.${field}` as const;
  spec(id, () => {
    test('is a positive integer of milliseconds', () => {
      expect(accepted({ ...gopls, [field]: 1 })?.[field]).toBe(1);
      expect(accepted({ ...gopls, [field]: 60000 })?.[field]).toBe(60000);
    });
    test('zero, a negative number, a fraction and a string are refused', () => {
      for (const bad of [0, -5, 1.5, '1000']) {
        expect(refusal({ ...gopls, [field]: bad })).toContain(field);
      }
    });
  });
});

spec('lsp.field.restartOnCrash', () => {
  test('is a boolean', () => {
    expect(accepted({ ...gopls, restartOnCrash: false })?.restartOnCrash).toBe(false);
    expect(accepted({ ...gopls, restartOnCrash: true })?.restartOnCrash).toBe(true);
    expect(refusal({ ...gopls, restartOnCrash: 'no' })).toContain('restartOnCrash');
  });
});

spec('lsp.field.maxRestarts', () => {
  test('is an integer of zero or more', () => {
    expect(accepted({ ...gopls, maxRestarts: 0 })?.maxRestarts).toBe(0);
    expect(accepted({ ...gopls, maxRestarts: 5 })?.maxRestarts).toBe(5);
  });
  test('a negative number, a fraction and a string are refused', () => {
    for (const bad of [-1, 2.5, '3']) {
      expect(refusal({ ...gopls, maxRestarts: bad })).toContain('maxRestarts');
    }
  });
});

spec('lsp.field.diagnostics', () => {
  test('is a boolean', () => {
    expect(accepted({ ...gopls, diagnostics: false })?.diagnostics).toBe(false);
    expect(refusal({ ...gopls, diagnostics: 'off' })).toContain('diagnostics');
  });
});

describe('a strict object (manifest-reference, "Each server config is a strict object")', () => {
  test('an unknown key fails and is named', () => {
    const message = refusal({ ...gopls, rootPatterns: ['go.mod'] });
    expect(message).toContain('rootPatterns');
  });
  test('a typo of a documented field fails too', () => {
    expect(refusal({ ...gopls, extensionsToLanguage: { '.go': 'go' } })).toContain(
      'extensionsToLanguage',
    );
  });
  test('an entry that is not an object fails', () => {
    for (const bad of ['gopls', 3, null, ['gopls']]) {
      expect(refusal(bad)).toContain('expected an object');
    }
  });
});

describe('what the docs leave open (judgments)', () => {
  test('an empty command names nothing to run', () => {
    expect(refusal({ ...gopls, command: '' })).toContain('command');
  });
  test('a whitespace-only difference such as a tab counts as a space', () => {
    expect(refusal({ ...gopls, command: 'gopls\tserve' })).toContain('command');
  });
  test('a language ID is any string: the docs name no other rule for it', () => {
    expect(accepted({ command: 'x', extensionToLanguage: { '.x': '' } })).toBeDefined();
  });
});
