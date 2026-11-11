/**
 * env-vars.md § Set variables in settings files (the table: which file applies to whom; "they take
 * effect no matter how `claude` was launched"; a running session applies a saved change, a removal
 * waits for the next launch) and § Precedence (a settings value replaces the shell's; a variable a
 * setting pairs with is read first; between files the settings precedence decides; project and local
 * settings cannot set some variables).
 */
import { describe, expect, test } from 'bun:test';
import { reachOf } from '../../../src/settings/general/index.ts';
import { resolveSessionValue } from '../../../src/settings/general/index.ts';
import { envChange } from '../../../src/settings/env/index.ts';
import { sessionEnv } from '../../support/env.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const EXAMPLE = { API_TIMEOUT_MS: '1200000', BASH_DEFAULT_TIMEOUT_MS: '300000' };
const FACTS = { committed: true, serverManaged: false };

/** The shell's own value is replaced "no matter how claude was launched". */
const launchedFrom = { API_TIMEOUT_MS: 'from the shell', PATH: '/bin' };

describe('the env key of a file, whoever the file reaches', () => {
  spec('environment.host.Set variables in settings files.~/.claude/settings.json', () => {
    test('the docs example takes effect for you in every project, whatever the shell exported', () => {
      const resolved = sessionEnv([['user', EXAMPLE]], { shell: launchedFrom });
      expect(resolved.process).toEqual({ ...EXAMPLE, PATH: '/bin' });
      expect(reachOf('user', FACTS).yourMachine).toBe('every project');
    });

    test('it does not reach a teammate or a cloud session, even when the project is committed', () => {
      expect(reachOf('user', FACTS)).toMatchObject({ teammate: false, cloudSession: false });
    });
  });

  spec('environment.host.Set variables in settings files..claude/settings.json', () => {
    test('the variables apply to everyone working in the project: the shared file is read in the project', () => {
      expect(sessionEnv([['project', EXAMPLE]]).settings).toEqual(EXAMPLE);
      expect(reachOf('project', FACTS)).toMatchObject({
        yourMachine: 'this project',
        teammate: true,
      });
    });

    test('checked into source control it reaches teammates; left out of it, it does not', () => {
      expect(reachOf('project', { committed: false, serverManaged: false }).teammate).toBe(false);
    });
  });

  spec('environment.host.Set variables in settings files..claude/settings.local.json', () => {
    test('the variables apply to you in this project only', () => {
      expect(sessionEnv([['local', EXAMPLE]]).settings).toEqual(EXAMPLE);
      expect(reachOf('local', FACTS)).toEqual({
        yourMachine: 'this project',
        teammate: false,
        cloudSession: false,
      });
    });

    test('a value in it replaces the same variable of the shared project file', () => {
      const resolved = sessionEnv([
        ['project', { API_TIMEOUT_MS: 'shared' }],
        ['local', { API_TIMEOUT_MS: 'mine' }],
      ]);
      expect(resolved.settings).toEqual({ API_TIMEOUT_MS: 'mine' });
    });
  });

  spec('environment.host.Set variables in settings files.Managed settings', () => {
    test('the variables apply to everyone in the organization, and no other file overrides them', () => {
      const resolved = sessionEnv([
        ['managed', { API_TIMEOUT_MS: 'org' }],
        ['user', { API_TIMEOUT_MS: 'mine' }],
      ]);
      expect(resolved.settings).toEqual({ API_TIMEOUT_MS: 'org' });
      expect(reachOf('managed', FACTS)).toMatchObject({
        yourMachine: 'every project',
        teammate: true,
      });
    });
  });
});

describe('a running session and the next launch (the prose under Set variables in settings files)', () => {
  test('a saved change applies new and changed values, and removing a variable waits for the next launch', () => {
    const before = sessionEnv([['user', EXAMPLE]]).settings;
    const after = sessionEnv([['user', { API_TIMEOUT_MS: '5' }]]).settings;
    const change = envChange(before, after);
    expect(change.set).toEqual({ API_TIMEOUT_MS: '5' });
    expect(change.keptUntilRelaunch).toEqual(['BASH_DEFAULT_TIMEOUT_MS']);
  });
});

spec('environment.host.Precedence', () => {
  test('a settings env value replaces the same variable inherited from the shell', () => {
    const resolved = sessionEnv([['user', { ANTHROPIC_MODEL: 'from-settings' }]], {
      shell: { ANTHROPIC_MODEL: 'from-shell' },
    });
    expect(resolved.process.ANTHROPIC_MODEL).toBe('from-settings');
  });

  test('between settings files env values follow settings precedence: managed over user and project', () => {
    const resolved = sessionEnv([
      ['user', { A: 'user', B: 'user' }],
      ['project', { A: 'project', B: 'project' }],
      ['managed', { A: 'managed' }],
    ]);
    expect(resolved.settings).toEqual({ A: 'managed', B: 'project' });
  });

  test('project and local settings cannot set CLAUDE_CONFIG_DIR or the OpenTelemetry exporter variables, but the off values apply', () => {
    for (const scope of ['project', 'local'] as const) {
      const resolved = sessionEnv([
        [
          scope,
          { CLAUDE_CONFIG_DIR: '/x', OTEL_METRICS_EXPORTER: 'otlp', OTEL_LOGS_EXPORTER: 'none' },
        ],
      ]);
      expect(resolved.settings).toEqual({ OTEL_LOGS_EXPORTER: 'none' });
    }
  });

  test('an OpenTelemetry off value from a repository overrides user settings, but not the shell, a --settings file or managed settings', () => {
    const off = ['project', { OTEL_LOGS_EXPORTER: 'none' }] as const;
    const user = ['user', { OTEL_LOGS_EXPORTER: 'otlp' }] as const;
    expect(sessionEnv([user, off]).process.OTEL_LOGS_EXPORTER).toBe('none');
    expect(
      sessionEnv([user, off], { shell: { OTEL_LOGS_EXPORTER: 'otlp' } }).process.OTEL_LOGS_EXPORTER,
    ).toBe('otlp');
    expect(
      sessionEnv([off, ['flag', { OTEL_LOGS_EXPORTER: 'otlp' }]]).process.OTEL_LOGS_EXPORTER,
    ).toBe('otlp');
    expect(
      sessionEnv([off, ['managed', { OTEL_LOGS_EXPORTER: 'otlp' }]]).process.OTEL_LOGS_EXPORTER,
    ).toBe('otlp');
  });

  test('ANTHROPIC_MODEL and CLAUDE_CODE_AUTO_CONNECT_IDE are read first, and the model and autoConnectIde settings only when the variable is unset', () => {
    const input = (env: Record<string, string>, settingsValue: string) => ({
      flags: {},
      env,
      settingsValue,
    });
    expect(
      resolveSessionValue('model', input({ ANTHROPIC_MODEL: 'var-model' }, 'file-model')),
    ).toEqual({
      value: 'var-model',
      from: 'ANTHROPIC_MODEL',
    });
    expect(resolveSessionValue('model', input({}, 'file-model'))?.value).toBe('file-model');
    expect(
      resolveSessionValue(
        'autoConnectIde',
        input({ CLAUDE_CODE_AUTO_CONNECT_IDE: 'true' }, 'false'),
      )?.value,
    ).toBe('true');
    expect(resolveSessionValue('autoConnectIde', input({}, 'false'))?.value).toBe('false');
  });

  test('a variable a settings env block sets counts as the variable: it is read before the model setting', () => {
    const resolved = sessionEnv([['user', { ANTHROPIC_MODEL: 'from-env-block' }]]);
    const view = layerOf('user', { model: 'from-key', env: { ANTHROPIC_MODEL: 'from-env-block' } });
    expect(
      resolveSessionValue('model', {
        flags: {},
        env: resolved.process,
        settingsValue: view.settings.model,
      })?.value,
    ).toBe('from-env-block');
  });

  test('--model and /model override ANTHROPIC_MODEL, while CLAUDE_CODE_EFFORT_LEVEL overrides --effort', () => {
    const base = { settingsValue: undefined };
    expect(
      resolveSessionValue('model', {
        ...base,
        flags: { '--model': 'flag-model' },
        env: { ANTHROPIC_MODEL: 'var' },
      })?.value,
    ).toBe('flag-model');
    expect(
      resolveSessionValue('effortLevel', {
        ...base,
        flags: { '--effort': 'low' },
        env: { CLAUDE_CODE_EFFORT_LEVEL: 'high' },
      })?.value,
    ).toBe('high');
  });

  test('the empty string overrides a variable that cannot be unset, and subprocesses still inherit the empty value', () => {
    const resolved = sessionEnv([['user', { CLAUDE_CODE_USE_VERTEX: '' }]], {
      shell: { CLAUDE_CODE_USE_VERTEX: '1' },
    });
    expect(resolved.process.CLAUDE_CODE_USE_VERTEX).toBe('');
    expect(resolved.subprocess.CLAUDE_CODE_USE_VERTEX).toBe('');
  });
});
