/**
 * server-managed-settings.md § Security approval dialogs and § Environment variables and the
 * approval dialog: which delivered settings the dialog must name.
 */
import { describe, expect, test } from 'bun:test';
import {
  approvalItems,
  minimumVersionEffect,
  serverChangeTiming,
} from '../../../src/settings/managed/index.ts';
import { spec } from '../../support/spec.ts';

const D = 'policy.server.Security approval dialogs.';
const kinds = (settings: Record<string, unknown>) => approvalItems(settings).map((i) => i.kind);
const keys = (settings: Record<string, unknown>) => approvalItems(settings).map((i) => i.key);

spec(`${D}Shell command settings`, () => {
  test('apiKeyHelper, statusLine and otelHeadersHelper need approval', () => {
    const settings = {
      apiKeyHelper: 'x',
      statusLine: { type: 'command', command: 'y' },
      otelHeadersHelper: 'z',
    };
    expect(keys(settings)).toEqual(['apiKeyHelper', 'statusLine', 'otelHeadersHelper']);
    expect(new Set(kinds(settings))).toEqual(new Set(['shell-command']));
  });
  test('a managed claudeMd needs none', () => {
    expect(approvalItems({ claudeMd: 'be kind' })).toEqual([]);
  });
});

spec(`${D}Sandbox binary settings`, () => {
  test('bwrapPath, socatPath and ripgrep point at executables', () => {
    const sandbox = { bwrapPath: '/b', socatPath: '/s', ripgrep: { command: '/rg' } };
    expect(keys({ sandbox })).toEqual([
      'sandbox.bwrapPath',
      'sandbox.socatPath',
      'sandbox.ripgrep',
    ]);
    expect(new Set(kinds({ sandbox }))).toEqual(new Set(['sandbox-binary']));
  });
});

spec(`${D}Sandbox network and isolation settings`, () => {
  test('each listed setting needs approval', () => {
    const sandbox = {
      allowAppleEvents: true,
      network: {
        tlsTerminate: {},
        httpProxyPort: 1,
        allowUnixSockets: ['/s'],
        allowMachLookup: ['x'],
      },
      filesystem: { disabled: true },
    };
    expect(new Set(keys({ sandbox }))).toEqual(
      new Set([
        'sandbox.allowAppleEvents',
        'sandbox.network.tlsTerminate',
        'sandbox.network.httpProxyPort',
        'sandbox.network.allowUnixSockets',
        'sandbox.network.allowMachLookup',
        'sandbox.filesystem.disabled',
      ]),
    );
  });
  test('a credentials block of deny rules only needs none; a mask does', () => {
    const deny = {
      credentials: {
        files: [{ path: '~/.ssh', mode: 'deny' }],
        envVars: [{ name: 'T', mode: 'deny' }],
      },
    };
    expect(approvalItems({ sandbox: deny })).toEqual([]);
    const mask = { credentials: { envVars: [{ name: 'T', mode: 'mask' }] } };
    expect(keys({ sandbox: mask })).toEqual(['sandbox.credentials']);
  });
  test('other sandbox settings need none', () => {
    expect(
      approvalItems({ sandbox: { enabled: true, network: { allowedDomains: ['a.com'] } } }),
    ).toEqual([]);
  });
});

spec(`${D}Hook configurations`, () => {
  test('any hook definition needs approval; an empty hooks block does not', () => {
    expect(keys({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } })).toEqual([
      'hooks',
    ]);
    expect(approvalItems({ hooks: {} })).toEqual([]);
  });
});

spec(`${D}Custom environment variables`, () => {
  const needs = (env: Record<string, string>) => keys({ env });
  describe('by name', () => {
    test('proxy, base-URL, OTLP endpoint and 1M-context variables always need approval', () => {
      expect(
        needs({
          HTTPS_PROXY: 'http://p',
          ANTHROPIC_BASE_URL: 'https://g',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'https://o',
          CLAUDE_CODE_DISABLE_1M_CONTEXT: '0',
        }),
      ).toHaveLength(4);
    });
    test('model, compaction and other toggles apply without it', () => {
      expect(
        needs({
          ANTHROPIC_MODEL: 'haiku',
          DISABLE_AUTO_COMPACT: '1',
          BASH_DEFAULT_TIMEOUT_MS: '5',
        }),
      ).toEqual([]);
    });
  });
  describe('by value', () => {
    test.each([
      'DISABLE_TELEMETRY',
      'DO_NOT_TRACK',
      'DISABLE_ERROR_REPORTING',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'API_FORCE_IDLE_TIMEOUT',
    ])('%s: a truthy value applies, any other non-empty value asks', (name) => {
      expect(needs({ [name]: '1' })).toEqual([]);
      expect(needs({ [name]: 'true' })).toEqual([]);
      expect(needs({ [name]: 'maybe' })).toEqual([`env.${name}`]);
    });
    test.each(['ENABLE_BETA_TRACING_DETAILED', 'OTEL_LOG_RAW_API_BODIES'])(
      '%s: a falsy value applies',
      (name) => {
        expect(needs({ [name]: '0' })).toEqual([]);
        expect(needs({ [name]: 'false' })).toEqual([]);
        expect(needs({ [name]: '1' })).toEqual([`env.${name}`]);
      },
    );
    test('ANTHROPIC_CUSTOM_HEADERS: tagging headers apply, credential, routing and word-matched ones ask', () => {
      const headers = (value: string) => needs({ ANTHROPIC_CUSTOM_HEADERS: value });
      expect(headers('Accept-Language: en')).toEqual([]);
      expect(headers('Authorization: Bearer t')).toHaveLength(1);
      expect(headers('X-Api-Key: k')).toHaveLength(1);
      expect(headers('Host: internal')).toHaveLength(1);
      expect(headers('anthropic-beta: x')).toHaveLength(1);
      expect(headers('X-Client-Version: 1')).toHaveLength(1);
      expect(headers('Bad Name: v')).toHaveLength(1);
      expect(headers('X-Tag: a\u0001b')).toHaveLength(1);
    });
  });
});

spec('policy.managed.Where and when a policy applies.Changes that need approval', () => {
  const timing = (settings: Record<string, unknown>, hosted: boolean) =>
    serverChangeTiming({
      needsApproval: approvalItems(settings).length > 0,
      waitsForNextLaunch: false,
      hosted,
    });
  test('a server-managed hook or env variable change waits for the dialog in an interactive session', () => {
    expect(timing({ hooks: { Stop: [{ hooks: [] }] } }, false)).toBe('awaits-approval');
    expect(timing({ env: { HTTPS_PROXY: 'http://p' } }, false)).toBe('awaits-approval');
  });
  test('it applies for the current run in a session an IDE extension or the Agent SDK hosts', () => {
    expect(timing({ env: { HTTPS_PROXY: 'http://p' } }, true)).toBe('applies-for-current-run');
  });
  test('a change that needs no approval applies on the next poll', () => {
    expect(timing({ permissions: { deny: ['Bash(rm *)'] } }, false)).toBe('next-poll');
  });
});

spec('policy.managed.Where and when a policy applies.Long-lived sessions', () => {
  test('requiredMinimumVersion blocks an outdated binary from starting and does not end a running session', () => {
    expect(minimumVersionEffect({ outdated: true, running: false }).blocksStart).toBe(true);
    expect(minimumVersionEffect({ outdated: true, running: true })).toEqual({
      blocksStart: false,
      endsSession: false,
    });
  });
});
