/**
 * settings-reference.md § Variables Claude Code ignores in `env` (each bullet: the storage, Windows,
 * session-content, OpenTelemetry, startup, sign-in, screen-reader, dialog-timer, attachment and
 * file-mention variables a repository cannot set, the telemetry off values that still apply, and the
 * variables no file sets); permissions.md § What runs before you trust a folder (the `env` row).
 * Each case reads a settings file the way a host does and checks what is left of its `env`.
 */
import { describe, expect, test } from 'bun:test';
import { ignoredBecause } from '../../../src/settings/env/index.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const envOf = (scope: Parameters<typeof layerOf>[0], env: Record<string, string>) =>
  layerOf(scope, { env }).settings.env;

const names = (env: Record<string, string> | undefined): string[] => Object.keys(env ?? {});

const ALL = (list: readonly string[]): Record<string, string> =>
  Object.fromEntries(list.map((name) => [name, 'x']));

const REPOSITORY_ONLY = {
  'where Claude Code keeps its files': [
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_CODE_TMPDIR',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_CACHE_HOME',
  ],
  'the programs and machine configuration of Windows': [
    'SystemRoot',
    'ComSpec',
    'ProgramData',
    'LOCALAPPDATA',
    'PATHEXT',
    'PSModulePath',
    'ProgramFiles',
    'ProgramFiles(x86)',
  ],
  'session content exporters': [
    'OTEL_LOG_RAW_API_BODIES',
    'ENABLE_BETA_TRACING_DETAILED',
    'BETA_TRACING_ENDPOINT',
  ],
  'how Claude Code starts or syncs': [
    'CLAUDE_CODE_PROCESS_WRAPPER',
    'CLAUDE_CODE_SYNC_SKILLS',
    'CLAUDE_CODE_SYNC_PLUGINS',
    'CLAUDE_CODE_PLUGIN_CACHE_DIR',
    'CLAUDE_CODE_PLUGIN_SEED_DIR',
  ],
  'the claude.ai sign-in': [
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
    'CLAUDE_CODE_OAUTH_SCOPES',
  ],
  'screen reader mode': ['CLAUDE_AX_SCREEN_READER', 'CLAUDE_AX_STARTUP_QUIET_MS', 'CLAUDE_AX_NEW'],
  'the dialog timer': ['CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS'],
  'attachment processing': ['CLAUDE_CODE_DISABLE_ATTACHMENTS'],
  '@ mention expansion': ['CLAUDE_CODE_DISABLE_FILE_MENTIONS'],
};

const EVERY_FILE = [
  'CLAUDE_CODE_REMOTE',
  'CLAUDE_CODE_ACCOUNT_UUID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_PROJECT_DIR_NAME',
  'CLAUDE_CODE_RESTRICTED',
  'CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY',
  'CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT',
  'CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT',
  'CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT',
  'CLAUDE_CODE_DISABLE_MOUNTED_DRIVE_RM_PROMPT',
  'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS',
  'CLAUDE_CODE_WARN_DISK_FREE_GIB',
  'CLAUDE_CODE_WARN_MEMORY_FREE_GIB',
];

const TELEMETRY = [
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA',
  'ENABLE_ENHANCED_TELEMETRY_BETA',
  'OTEL_LOG_ASSISTANT_RESPONSES',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_EXPORTER_OTLP_LOGS_CERTIFICATE',
  'OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY',
  'OTEL_EXPORTER_OTLP_INSECURE',
  'OTEL_EXPORTER_PROMETHEUS_HOST',
  'OTEL_EXPORTER_PROMETHEUS_PORT',
];

spec('settings.reference.Variables Claude Code ignores in env', () => {
  describe('project and local settings', () => {
    for (const scope of ['project', 'local'] as const) {
      for (const [group, list] of Object.entries(REPOSITORY_ONLY)) {
        test(`${scope}: a variable of ${group} is dropped, and a name for an ordinary variable stays`, () => {
          expect(names(envOf(scope, { ...ALL(list), KEEP_ME: '1' }))).toEqual(['KEEP_ME']);
        });
      }

      test(`${scope}: every OpenTelemetry exporter variable that turns telemetry on or chooses its destination is dropped`, () => {
        const ignored = ALL([
          ...TELEMETRY,
          'OTEL_LOGS_EXPORTER',
          'OTEL_LOG_USER_PROMPTS',
          'OTEL_LOG_TOOL_CONTENT',
        ]);
        expect(names(envOf(scope, { ...ignored, KEEP_ME: '1' }))).toEqual(['KEEP_ME']);
      });

      test(`${scope}: the variables no file may set are dropped as well`, () => {
        expect(names(envOf(scope, ALL(EVERY_FILE)))).toEqual([]);
      });
    }

    test('every dropped variable is reported by name and the report never holds its value', () => {
      const found = issuesOf('project', {
        env: { CLAUDE_CONFIG_DIR: '/tmp/secret-path', OK: '1' },
      });
      expect(found.map((one) => one.path)).toEqual(['project:env.CLAUDE_CONFIG_DIR']);
      expect(found[0]?.message).toContain('CLAUDE_CONFIG_DIR');
      expect(found[0]?.message).not.toContain('/tmp/secret-path');
    });

    test('the variables of a family are matched by prefix or suffix, not by a longer name that only contains it', () => {
      expect(
        names(envOf('project', { MY_XDG_THING: '1', HOMEBREW: '1', OTEL_EXPORTER_OTLP_FOO: '1' })),
      ).toEqual(['MY_XDG_THING', 'HOMEBREW', 'OTEL_EXPORTER_OTLP_FOO']);
    });
  });

  describe('the values that turn telemetry off still apply from a repository', () => {
    test('none for the three exporter selectors', () => {
      for (const name of ['OTEL_LOGS_EXPORTER', 'OTEL_METRICS_EXPORTER', 'OTEL_TRACES_EXPORTER']) {
        expect(envOf('project', { [name]: 'none' })).toEqual({ [name]: 'none' });
        expect(envOf('local', { [name]: 'otlp' })).toEqual({});
      }
    });

    test('an off value such as 0 for the three content variables', () => {
      for (const name of [
        'OTEL_LOG_USER_PROMPTS',
        'OTEL_LOG_TOOL_CONTENT',
        'OTEL_LOG_TOOL_DETAILS',
      ]) {
        expect(envOf('project', { [name]: '0' })).toEqual({ [name]: '0' });
        expect(envOf('local', { [name]: '1' })).toEqual({});
      }
    });

    test('OTEL_LOG_ASSISTANT_RESPONSES has no off value: even 0 is dropped from a repository', () => {
      expect(envOf('project', { OTEL_LOG_ASSISTANT_RESPONSES: '0' })).toEqual({});
    });

    test('none does not turn a content variable off, nor 0 an exporter selector', () => {
      expect(envOf('project', { OTEL_LOG_USER_PROMPTS: 'none', OTEL_LOGS_EXPORTER: '0' })).toEqual(
        {},
      );
    });
  });

  describe('user, --settings and managed settings', () => {
    for (const scope of ['user', 'flag', 'managed'] as const) {
      test(`${scope}: the variables a repository cannot set stay`, () => {
        const list = Object.values(REPOSITORY_ONLY).flat();
        expect(names(envOf(scope, ALL([...list, ...TELEMETRY])))).toEqual([...list, ...TELEMETRY]);
      });

      test(`${scope}: the variables no file may set are still dropped`, () => {
        expect(names(envOf(scope, { ...ALL(EVERY_FILE), KEEP_ME: '1' }))).toEqual(['KEEP_ME']);
      });
    }
  });

  test('ignoredBecause answers per scope, name and value', () => {
    const envIgnored = (...args: Parameters<typeof ignoredBecause>) =>
      ignoredBecause(...args) !== undefined;
    expect(envIgnored('project', 'HOME', '/x')).toBe(true);
    expect(envIgnored('user', 'HOME', '/x')).toBe(false);
    expect(envIgnored('user', 'CLAUDE_CODE_REMOTE', '1')).toBe(true);
    expect(envIgnored('local', 'OTEL_METRICS_EXPORTER', 'none')).toBe(false);
  });
});
