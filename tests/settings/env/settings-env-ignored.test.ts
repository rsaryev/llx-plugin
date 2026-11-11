/**
 * settings-reference.md § `env`: "Variables Claude Code ignores in `env`", "How `env` values interact
 * with your shell" and "When Claude Code applies `env` values" (the `env` key of the settings index).
 * What the sections say of Claude Code's own interface (colors, the debug log, the startup-only
 * features, the notices) is a host's; the kit proves the rules over the files and the environment.
 * The `NO_COLOR` and `FORCE_COLOR` bullet ("reach only subprocesses; to change Claude Code's own
 * interface colors, set them in your shell") is about the host's interface, so no test here claims it.
 *
 * `resolveSettingsEnv` and `resolveEnv` are one resolver (`src/settings/env/`). Where the two used to
 * differ the docs decide: "`CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS`, which Claude Code reads
 * from the launch environment only, is ignored from every file", and so are
 * "`CLAUDE_CODE_WARN_DISK_FREE_GIB` and `CLAUDE_CODE_WARN_MEMORY_FREE_GIB`"; "From project and local
 * settings: after you trust the workspace, or at startup in `-p` mode". The rest are judgments
 * (spec/judgments.md): the `ProgramFiles` family includes `ProgramW6432`, an off value matches in any
 * case, and the `env` row of the key table decides which scopes carry the block.
 */
import { expect, test } from 'bun:test';
import type { PolicyScope } from '../../../src/settings/index.ts';
import {
  envLayer as layer,
  envValues as names,
  resolveEnvOf as resolve,
} from '../../support/settings-env.ts';
import { spec } from '../../support/spec.ts';

const dropped = (name: string, value = 'x', scope: PolicyScope = 'project') =>
  resolve([layer(scope, { [name]: value })]).ignored.map((entry) => entry.why);

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
      expect(dropped(name)).toEqual(['storage']);
      expect(dropped(name, 'x', 'local')).toEqual(['storage']);
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
      'ProgramW6432',
    ]) {
      expect(dropped(name)).toEqual(['windows']);
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
      expect(dropped(name)).toHaveLength(1);
      expect(dropped(name, 'x', 'user')).toEqual([]);
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
      expect(dropped(name)).toEqual(['telemetry']);
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
      'CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS',
      'CLAUDE_CODE_WARN_DISK_FREE_GIB',
      'CLAUDE_CODE_WARN_MEMORY_FREE_GIB',
    ]) {
      const reason = ['CLAUDE_CODE_REMOTE', 'CLAUDE_CODE_ACCOUNT_UUID'].includes(name)
        ? 'identity'
        : 'launch-only';
      for (const scope of ['user', 'managed', 'flag', 'project'] as const) {
        expect(dropped(name, '1', scope)).toEqual([reason]);
      }
    }
  });

  test('on Windows the names are matched without regard to case', () => {
    const result = resolve([layer('project', { systemroot: 'C:\\x', Home: 'C:\\h', KEEP: '1' })], {
      windows: true,
    });
    expect(result.values).toEqual({ KEEP: '1' });
    const posix = resolve([layer('project', { systemroot: 'x', Home: 'h' })]);
    // The Windows group compares without case on any host (spec/judgments.md); `Home` is another name there.
    expect(posix.values).toEqual({ Home: 'h' });
  });
});
