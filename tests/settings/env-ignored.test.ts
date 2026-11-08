/**
 * settings-reference.md § `env`: "Variables Claude Code ignores in `env`", "How `env` values interact
 * with your shell" and "When Claude Code applies `env` values" (the `env` key of the settings index).
 * What the sections say of Claude Code's own interface (colors, the debug log, the startup-only
 * features, the notices) is a host's; the kit proves the rules over the files and the environment.
 * The `NO_COLOR` and `FORCE_COLOR` bullet ("reach only subprocesses; to change Claude Code's own
 * interface colors, set them in your shell") is about the host's interface, so no test here claims it.
 */
import { describe, expect, test } from 'bun:test';
import { applySettingsEnv, resolveSettingsEnv } from '../../src/settings/index.ts';
import type { PolicyScope, PolicyLayer } from '../../src/settings/index.ts';
import { spec } from '../support/spec.ts';

const layer = (scope: PolicyScope, env: Record<string, string>) => ({ scope, settings: { env } });
const trusted = { isFolderTrusted: () => true };
const resolve = (
  layers: PolicyLayer[],
  context: Partial<Parameters<typeof resolveSettingsEnv>[1]> = {},
) => resolveSettingsEnv(layers, { ...trusted, ...context });
const names = (layers: PolicyLayer[], context = {}) => resolve(layers, context).values;
const dropped = (name: string, value = 'x', scope: PolicyScope = 'project') =>
  resolve([layer(scope, { [name]: value })]).ignored.map((entry) => entry.reason);

spec('settings.reference.Variables Claude Code ignores in env', () => {
  test('project and local files cannot set where Claude Code writes its files', () => {
    for (const name of [
      'CLAUDE_CONFIG_DIR',
      'CLAUDE_CODE_TMPDIR',
      'HOME',
      'TMPDIR',
      'TMP',
      'TEMP',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
    ]) {
      expect(dropped(name)).toEqual(['repository']);
      expect(dropped(name, 'x', 'local')).toEqual(['repository']);
    }
  });

  test('nor the Windows variables that pick programs', () => {
    for (const name of [
      'SystemRoot',
      'ComSpec',
      'ProgramData',
      'LOCALAPPDATA',
      'PATHEXT',
      'PSModulePath',
      'ProgramFiles',
      'ProgramFiles(x86)',
    ]) {
      expect(dropped(name)).toEqual(['repository']);
    }
  });

  test('nor the variables that export session content, start or sync Claude Code, or sign in', () => {
    for (const name of [
      'OTEL_LOG_RAW_API_BODIES',
      'ENABLE_BETA_TRACING_DETAILED',
      'BETA_TRACING_ENDPOINT',
      'CLAUDE_CODE_PROCESS_WRAPPER',
      'CLAUDE_CODE_SYNC_SKILLS',
      'CLAUDE_CODE_SYNC_PLUGINS',
      'CLAUDE_CODE_PLUGIN_CACHE_DIR',
      'CLAUDE_CODE_PLUGIN_SEED_DIR',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
      'CLAUDE_CODE_OAUTH_SCOPES',
      'CLAUDE_AX_SCREEN_READER',
      'CLAUDE_AX_STARTUP_QUIET_MS',
      'CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS',
      'CLAUDE_CODE_DISABLE_ATTACHMENTS',
      'CLAUDE_CODE_DISABLE_FILE_MENTIONS',
    ]) {
      expect(dropped(name)).toEqual(['repository']);
    }
  });

  test('nor the OpenTelemetry exporter variables, in the generic and per-signal forms', () => {
    for (const name of [
      'CLAUDE_CODE_ENABLE_TELEMETRY',
      'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA',
      'ENABLE_ENHANCED_TELEMETRY_BETA',
      'OTEL_LOGS_EXPORTER',
      'OTEL_LOG_ASSISTANT_RESPONSES',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_PROTOCOL',
      'OTEL_EXPORTER_OTLP_CERTIFICATE',
      'OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY',
      'OTEL_EXPORTER_OTLP_INSECURE',
      'OTEL_EXPORTER_PROMETHEUS_HOST',
      'OTEL_EXPORTER_PROMETHEUS_PORT',
    ]) {
      expect(dropped(name)).toEqual(['repository']);
    }
  });

  test('an OTLP variable the docs do not list is not dropped', () => {
    expect(resolve([layer('project', { OTEL_EXPORTER_OTLP_TIMEOUT: '5000' })]).values).toEqual({
      OTEL_EXPORTER_OTLP_TIMEOUT: '5000',
    });
  });

  test('user and managed settings may set them', () => {
    for (const scope of ['user', 'managed', 'flag'] as const) {
      expect(
        resolve([layer(scope, { CLAUDE_CONFIG_DIR: '/c', OTEL_LOGS_EXPORTER: 'otlp' })]).values,
      ).toEqual({
        CLAUDE_CONFIG_DIR: '/c',
        OTEL_LOGS_EXPORTER: 'otlp',
      });
    }
  });

  test('a variable that turns telemetry off still applies: none for the exporters, an off value for the content variables', () => {
    const values = names([
      layer('project', {
        OTEL_LOGS_EXPORTER: 'none',
        OTEL_METRICS_EXPORTER: 'otlp',
        OTEL_LOG_USER_PROMPTS: '0',
        OTEL_LOG_TOOL_CONTENT: '1',
        OTEL_LOG_TOOL_DETAILS: '0',
        OTEL_LOG_ASSISTANT_RESPONSES: '0',
      }),
    ]);
    expect(values).toEqual({
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_LOG_USER_PROMPTS: '0',
      OTEL_LOG_TOOL_DETAILS: '0',
    });
  });

  test('an off value overrides user settings but not the environment Claude Code starts from, --settings or managed settings', () => {
    const off = layer('project', { OTEL_LOGS_EXPORTER: 'none' });
    expect(names([layer('user', { OTEL_LOGS_EXPORTER: 'otlp' }), off])).toEqual({
      OTEL_LOGS_EXPORTER: 'none',
    });
    expect(names([off], { environment: { OTEL_LOGS_EXPORTER: 'otlp' } })).toEqual({});
    expect(names([off, layer('flag', { OTEL_LOGS_EXPORTER: 'otlp' })])).toEqual({
      OTEL_LOGS_EXPORTER: 'otlp',
    });
    expect(names([off, layer('managed', { OTEL_LOGS_EXPORTER: 'otlp' })])).toEqual({
      OTEL_LOGS_EXPORTER: 'otlp',
    });
  });

  test('a dropped variable does not hide the same variable of a lower file', () => {
    expect(
      names([layer('user', { TMPDIR: '/user-tmp' }), layer('project', { TMPDIR: '/evil' })]),
    ).toEqual({ TMPDIR: '/user-tmp' });
  });

  test('no file sets the identity variables Claude Code hosts own, nor the ones read from the launch environment', () => {
    for (const name of [
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
    ]) {
      for (const scope of ['user', 'managed', 'project'] as const) {
        expect(dropped(name, '1', scope)).toEqual(['host-owned']);
      }
    }
  });

  test('on Windows the names are matched without regard to case', () => {
    const result = resolveSettingsEnv(
      [layer('project', { systemroot: 'C:\\x', Home: 'C:\\h', KEEP: '1' })],
      {
        ...trusted,
        windows: true,
      },
    );
    expect(result.values).toEqual({ KEEP: '1' });
    const posix = resolveSettingsEnv([layer('project', { systemroot: 'x', Home: 'h' })], trusted);
    expect(posix.values).toEqual({ systemroot: 'x', Home: 'h' });
  });
});

spec('settings.reference.How env values interact with your shell', () => {
  test('a session started by Claude Desktop or a self-hosted runner keeps the launch environment: a file value for a variable it sets is ignored', () => {
    const result = resolve([layer('user', { A: 'file', B: 'file' })], {
      environment: { A: 'launch' },
      launchOwnsEnvironment: true,
    });
    expect(result.values).toEqual({ B: 'file' });
    expect(result.ignored).toEqual([{ name: 'A', scope: 'user', reason: 'launch' }]);
  });

  test('an empty value cancels a shell export, and the subprocess inherits the empty value', () => {
    const values = names([layer('user', { CLAUDE_CODE_USE_VERTEX: '' })]);
    expect(applySettingsEnv({ CLAUDE_CODE_USE_VERTEX: '1' }, values, false)).toEqual({
      CLAUDE_CODE_USE_VERTEX: '',
    });
  });

  test('when several files set a variable the highest-precedence one applies', () => {
    expect(
      names([layer('user', { A: 'u' }), layer('flag', { A: 'f' }), layer('local', { A: 'l' })]),
    ).toEqual({
      A: 'f',
    });
  });

  test('otherwise the shell value is replaced by the file', () => {
    expect(names([layer('user', { A: 'file' })], { environment: { A: 'shell' } })).toEqual({
      A: 'file',
    });
  });
});

spec('settings.reference.When Claude Code applies env values', () => {
  test('user, --settings and managed settings apply without trust; project and local settings after the workspace is trusted', () => {
    const files = [
      layer('user', { U: '1' }),
      layer('flag', { F: '1' }),
      layer('managed', { M: '1' }),
      layer('project', { P: '1' }),
      layer('local', { L: '1' }),
    ];
    expect(names(files, { isFolderTrusted: () => false })).toEqual({
      U: '1',
      F: '1',
      M: '1',
    });
    expect(names(files, { isFolderTrusted: () => true })).toEqual({
      U: '1',
      F: '1',
      M: '1',
      P: '1',
      L: '1',
    });
  });

  test('a saved change that alters the merged env is a new resolution the host applies again; a removed variable stays in the running session', () => {
    const before = names([layer('user', { A: '1', B: '2' })]);
    const after = names([layer('user', { A: '9' })]);
    const running = applySettingsEnv(applySettingsEnv({}, before, false), after, false);
    expect(running).toEqual({ A: '9', B: '2' });
  });

  test("after /cd the new directory's project and local values go on top of the previous directory's, once its trust is answered", () => {
    const trust = new Map([
      ['/first', true],
      ['/second', false],
    ]);
    const asked: string[] = [];
    const resolveIn = (folder: string, files: ReturnType<typeof layer>[]) =>
      resolve(files, {
        isFolderTrusted: (scope) => {
          asked.push(`${folder}:${scope}`);
          return trust.get(folder) === true;
        },
      });
    const first = resolveIn('/first', [layer('project', { A: 'first', ONLY_FIRST: '1' })]).values;
    const running = applySettingsEnv({}, first, false);
    const files = [layer('project', { A: 'second' }), layer('local', { L: '1' })];

    expect(resolveIn('/second', files).values).toEqual({});
    expect(asked).toContain('/second:project');
    expect(asked).toContain('/second:local');

    trust.set('/second', true);
    expect(applySettingsEnv(running, resolveIn('/second', files).values, false)).toEqual({
      A: 'second',
      ONLY_FIRST: '1',
      L: '1',
    });
  });
});

describe('judgment: untrusted files wait for trust', () => {
  test('a model selection or a timeout of an untrusted project file is not applied: the docs name no safe list', () => {
    const files = [layer('project', { ANTHROPIC_MODEL: 'sonnet', API_TIMEOUT_MS: '5' })];
    expect(names(files, { isFolderTrusted: () => false })).toEqual({});
  });
});

describe('judgment: scopes that do not carry env', () => {
  test('parent settings and --add-dir directories contribute no variable', () => {
    expect(names([layer('parent', { A: '1' }), layer('addDir', { B: '1' })])).toEqual({});
  });

  test('a layer with no env block adds nothing', () => {
    expect(names([{ scope: 'user', settings: {} }])).toEqual({});
  });
});
