/**
 * The `env` block of settings: env-vars.md § Set variables in settings files and § Precedence,
 * settings-reference.md § `env` ("How `env` values interact with your shell", "When Claude Code
 * applies `env` values", "Variables Claude Code ignores in `env`"), settings.md § Settings precedence.
 * The kit reads no file and starts no process (L3): the host hands the layers it read and gets the
 * variables to put in its environment.
 */
import { describe, expect, test } from 'bun:test';
import { applySettingsEnv, resolveSettingsEnv } from '../../src/settings/index.ts';
import type { PolicyScope, PolicyLayer } from '../../src/settings/index.ts';
import { spec } from '../support/spec.ts';
import { readSettingsLayer } from '../../src/settings/index.ts';

const layer = (scope: PolicyScope, env: Record<string, string>) => ({ scope, settings: { env } });

const trusted = { isFolderTrusted: () => true };

const resolve = (
  layers: PolicyLayer[],
  context: Partial<Parameters<typeof resolveSettingsEnv>[1]> = {},
) => resolveSettingsEnv(layers, { ...trusted, ...context });

const names = (layers: PolicyLayer[], context = {}) => resolve(layers, context).values;

spec(
  ['environment.host.Set variables in settings files.~/.claude/settings.json', 'settings.key.env'],
  () => {
    test('the user file sets variables for every project', () => {
      expect(
        names([
          layer('user', {
            API_TIMEOUT_MS: '1200000',
            BASH_DEFAULT_TIMEOUT_MS: '300000',
          }),
        ]),
      ).toEqual({
        API_TIMEOUT_MS: '1200000',
        BASH_DEFAULT_TIMEOUT_MS: '300000',
      });
    });

    test('the values are copied as written: no shell processes ~ or $HOME', () => {
      expect(names([layer('user', { WORK: '~/work', HOME_REF: '$HOME/.claude-work' })])).toEqual({
        WORK: '~/work',
        HOME_REF: '$HOME/.claude-work',
      });
    });

    test('string values pass to the process as written', () => {
      const read = readSettingsLayer('user', { env: { OK: '1', EMPTY: '' } });
      expect(resolve([read.layer]).values).toEqual({ OK: '1', EMPTY: '' });
      expect(read.issues).toEqual([]);
    });
  },
);

spec('environment.host.Set variables in settings files..claude/settings.json', () => {
  test('the project file applies to everyone working in the project, once the folder is trusted', () => {
    const project = layer('project', { TEAM_FLAG: '1' });
    expect(names([project])).toEqual({ TEAM_FLAG: '1' });
    const untrusted = resolve([project], { isFolderTrusted: () => false });
    expect(untrusted.values).toEqual({});
    expect(untrusted.ignored).toEqual([
      { name: 'TEAM_FLAG', scope: 'project', reason: 'untrusted' },
    ]);
  });

  test('trust is asked for the project folder, not the local file', () => {
    const asked: string[] = [];
    resolve([layer('project', { A: '1' })], {
      isFolderTrusted: (scope) => (asked.push(scope), true),
    });
    expect(asked).toEqual(['project']);
  });
});

spec('environment.host.Set variables in settings files..claude/settings.local.json', () => {
  test('the local file applies to the user in this project only, once the folder is trusted', () => {
    const local = layer('local', { MINE: '1' });
    expect(names([local])).toEqual({ MINE: '1' });
    expect(resolve([local], { isFolderTrusted: () => false }).values).toEqual({});
  });

  test('local wins over the project file, and both over the user file', () => {
    const values = names([
      layer('user', { A: 'user', B: 'user', C: 'user' }),
      layer('project', { A: 'project', B: 'project' }),
      layer('local', { A: 'local' }),
    ]);
    expect(values).toEqual({ A: 'local', B: 'project', C: 'user' });
  });
});

spec('environment.host.Set variables in settings files.Managed settings', () => {
  test('managed settings apply to everyone and override the same variable of every other file', () => {
    const values = names([
      layer('user', { PROXY: 'user' }),
      layer('local', { PROXY: 'local' }),
      layer('managed', { PROXY: 'managed' }),
    ]);
    expect(values).toEqual({ PROXY: 'managed' });
  });

  test('two managed sources combine per variable', () => {
    expect(names([layer('managed', { A: '1' }), layer('managed', { B: '2' })])).toEqual({
      A: '1',
      B: '2',
    });
  });

  test('managed settings need no workspace trust', () => {
    expect(names([layer('managed', { A: '1' })], { isFolderTrusted: () => false })).toEqual({
      A: '1',
    });
  });

  test('the --settings file ranks between managed and local', () => {
    const values = names([layer('local', { A: 'local' }), layer('flag', { A: 'flag' })]);
    expect(values).toEqual({ A: 'flag' });
  });
});

spec('environment.host.Precedence', () => {
  test('a settings file value replaces the value inherited from the shell', () => {
    expect(
      applySettingsEnv({ API_TIMEOUT_MS: '1', PATH: '/bin' }, { API_TIMEOUT_MS: '9' }, false),
    ).toEqual({
      API_TIMEOUT_MS: '9',
      PATH: '/bin',
    });
  });

  test('an empty string is applied: it overrides a stale export and subprocesses inherit the empty value', () => {
    const values = names([layer('user', { CLAUDE_CODE_USE_VERTEX: '' })]);
    expect(values).toEqual({ CLAUDE_CODE_USE_VERTEX: '' });
    expect(applySettingsEnv({ CLAUDE_CODE_USE_VERTEX: '1' }, values, false)).toEqual({
      CLAUDE_CODE_USE_VERTEX: '',
    });
  });

  test('a variable can be set but not removed: dropping it from the file leaves the running value', () => {
    const running = applySettingsEnv({}, { TOKEN_TTL: '5' }, false);
    expect(applySettingsEnv(running, {}, false)).toEqual({ TOKEN_TTL: '5' });
  });

  test('a managed entry beats the same variable in user or project settings', () => {
    expect(names([layer('project', { A: 'p' }), layer('managed', { A: 'm' })])).toEqual({ A: 'm' });
  });

  test('project and local settings cannot set CLAUDE_CONFIG_DIR and the exporter variables', () => {
    const result = resolve([
      layer('user', { CLAUDE_CONFIG_DIR: '/home/you/.claude-work' }),
      layer('project', {
        CLAUDE_CONFIG_DIR: '/tmp/evil',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://x',
        KEEP: '1',
      }),
    ]);
    expect(result.values).toEqual({
      CLAUDE_CONFIG_DIR: '/home/you/.claude-work',
      KEEP: '1',
    });
    expect(result.ignored.map(({ name }) => name).toSorted()).toEqual([
      'CLAUDE_CONFIG_DIR',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
    ]);
  });

  test('on Windows a settings value replaces the inherited one whatever the case of the name', () => {
    expect(applySettingsEnv({ Path: 'C:\\old', Other: '1' }, { PATH: 'C:\\new' }, true)).toEqual({
      PATH: 'C:\\new',
      Other: '1',
    });
  });
});

describe('judgment: two layers of one scope', () => {
  test('where two managed sources set the same variable the one given first wins', () => {
    expect(names([layer('managed', { A: 'first' }), layer('managed', { A: 'second' })])).toEqual({
      A: 'first',
    });
  });
});
