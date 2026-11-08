/**
 * settings-reference.md § `env` (scope, type, default, the example) and § How `env` values interact
 * with your shell (each of its five bullets); env-vars.md § Set variables in settings files ("Claude
 * Code copies these values into its environment as written. No shell processes them").
 */
import { describe, expect, test } from 'bun:test';
import { isUnsetForProvider, resolveEnv } from '../../../src/settings/env/index.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { TRUSTED, sessionEnv } from '../../support/env.ts';
import { spec } from '../../support/spec.ts';

const EXAMPLE = {
  DISABLE_AUTO_COMPACT: '1',
  ANTHROPIC_BASE_URL: 'https://proxy.example.com',
};

spec('settings.key.env', () => {
  test('the docs example sets both variables for the session and for every subprocess', () => {
    const resolved = sessionEnv([['user', EXAMPLE]], { shell: { PATH: '/bin' } });
    expect(resolved.process).toEqual({ PATH: '/bin', ...EXAMPLE });
    expect(resolved.subprocess).toEqual({ PATH: '/bin', ...EXAMPLE });
  });

  test('any file carries it: user, project, local, managed and --settings', () => {
    for (const scope of ['user', 'project', 'local', 'managed', 'flag'] as const) {
      expect(layerOf(scope, { env: { KEEP: '1' } }).settings.env).toEqual({ KEEP: '1' });
    }
  });

  test('it is an object of strings: another type is dropped with a warning, and so is a value that is not text', () => {
    expect(layerOf('user', { env: 'A=1' }).settings.env).toBeUndefined();
    expect(issuesOf('user', { env: ['A=1'] })[0]?.message).toContain('"env" must be an object');
    const mixed = layerOf('user', { env: { TEXT: '1', NUMBER: 1, FLAG: true, EMPTY: '' } });
    expect(mixed.settings.env).toEqual({ TEXT: '1', EMPTY: '' });
    expect(issuesOf('user', { env: { NUMBER: 1 } })[0]?.message).toContain(
      '"NUMBER" must be a string',
    );
  });

  test('unset by default: no file leaves the environment as it was started', () => {
    const resolved = sessionEnv([], { shell: { PATH: '/bin' } });
    expect(resolved.settings).toEqual({});
    expect(resolved.process).toEqual({ PATH: '/bin' });
  });

  test('a variable of the ignore list is not part of the example a project file can set', () => {
    const resolved = sessionEnv([['project', { ...EXAMPLE, CLAUDE_CONFIG_DIR: '/elsewhere' }]]);
    expect(Object.keys(resolved.settings)).toEqual(Object.keys(EXAMPLE));
  });
});

spec('settings.reference.How env values interact with your shell', () => {
  describe('a value here overwrites the same variable exported in the shell', () => {
    test('the settings value replaces the shell export, for Claude Code and for subprocesses', () => {
      const resolved = sessionEnv([['user', { HTTPS_PROXY: 'http://settings' }]], {
        shell: { HTTPS_PROXY: 'http://shell', KEPT: 'shell' },
      });
      expect(resolved.process).toEqual({ HTTPS_PROXY: 'http://settings', KEPT: 'shell' });
      expect(resolved.subprocess).toEqual({ HTTPS_PROXY: 'http://settings', KEPT: 'shell' });
    });

    test('when more than one file sets a variable the highest precedence file applies', () => {
      const files = [
        ['user', { A: 'user', B: 'user', C: 'user' }],
        ['project', { A: 'project', B: 'project' }],
        ['local', { A: 'local' }],
      ] as const;
      const resolved = sessionEnv(files);
      expect(resolved.settings).toEqual({ A: 'local', B: 'project', C: 'user' });
      expect(resolved.origin).toEqual({ A: 'local', B: 'project', C: 'user' });
    });

    test('managed settings beat every other file, and --settings beats project and user files', () => {
      const resolved = sessionEnv([
        ['managed', { A: 'managed' }],
        ['flag', { A: 'flag', B: 'flag' }],
        ['local', { A: 'local', B: 'local' }],
        ['user', { A: 'user', B: 'user' }],
      ]);
      expect(resolved.settings).toEqual({ A: 'managed', B: 'flag' });
    });

    test('the order the files are given in does not matter', () => {
      const user = ['user', { A: 'user' }] as const;
      const managed = ['managed', { A: 'managed' }] as const;
      expect(sessionEnv([managed, user]).settings).toEqual(sessionEnv([user, managed]).settings);
    });

    test('the exceptions for project and local settings are the ignored variables, which the shell keeps', () => {
      const resolved = sessionEnv([['project', { HOME: '/evil' }]], {
        shell: { HOME: '/home/me' },
      });
      expect(resolved.process.HOME).toBe('/home/me');
      expect(resolved.settings).toEqual({});
    });

    test('a layer built by hand, with no read in between, loses the ignored variable at resolution, which names it', () => {
      const resolved = resolveEnv({
        layers: [{ scope: 'project', settings: { env: { HOME: '/evil' } } }],
        trust: TRUSTED,
        shell: { HOME: '/home/me' },
      });
      expect(resolved.process.HOME).toBe('/home/me');
      expect(resolved.notApplied).toEqual([{ name: 'HOME', scope: 'project', why: 'storage' }]);
    });
  });

  describe('a launch environment built by the Claude Desktop app or a self-hosted runner takes precedence', () => {
    test('an env value for a variable the launch environment already sets is ignored, and named', () => {
      const resolved = sessionEnv(
        [['user', { ANTHROPIC_BASE_URL: 'https://settings', OTHER: 'settings' }]],
        { launchEnvironment: { ANTHROPIC_BASE_URL: 'https://launch' } },
      );
      expect(resolved.process.ANTHROPIC_BASE_URL).toBe('https://launch');
      expect(resolved.subprocess.ANTHROPIC_BASE_URL).toBe('https://launch');
      expect(resolved.process.OTHER).toBe('settings');
      expect(resolved.notApplied).toEqual([
        { name: 'ANTHROPIC_BASE_URL', scope: 'user', why: 'launch-environment' },
      ]);
    });

    test('the rule holds for every file, managed settings included', () => {
      const resolved = sessionEnv([['managed', { A: 'managed' }]], {
        launchEnvironment: { A: 'launch' },
      });
      expect(resolved.process.A).toBe('launch');
    });

    test('a variable the launch environment sets to the empty string is still set, so it still wins', () => {
      const resolved = sessionEnv([['user', { A: 'settings' }]], { launchEnvironment: { A: '' } });
      expect(resolved.process.A).toBe('');
    });
  });

  describe('an empty value cancels a shell export', () => {
    test('Claude Code treats the empty value as unset for provider selection', () => {
      const resolved = sessionEnv([['user', { CLAUDE_CODE_USE_VERTEX: '' }]], {
        shell: { CLAUDE_CODE_USE_VERTEX: '1' },
      });
      expect(isUnsetForProvider(resolved.process, 'CLAUDE_CODE_USE_VERTEX')).toBe(true);
      expect(isUnsetForProvider({ CLAUDE_CODE_USE_VERTEX: '1' }, 'CLAUDE_CODE_USE_VERTEX')).toBe(
        false,
      );
      expect(isUnsetForProvider({}, 'CLAUDE_CODE_USE_VERTEX')).toBe(true);
    });

    test('subprocesses inherit the empty value rather than the shell export', () => {
      const resolved = sessionEnv([['user', { CLAUDE_CODE_USE_VERTEX: '' }]], {
        shell: { CLAUDE_CODE_USE_VERTEX: '1' },
      });
      expect(resolved.subprocess).toEqual({ CLAUDE_CODE_USE_VERTEX: '' });
    });
  });

  describe('NO_COLOR and FORCE_COLOR set here reach only subprocesses', () => {
    test('Claude Code keeps the shell value for its own interface; subprocesses get the settings value', () => {
      const resolved = sessionEnv([['user', { NO_COLOR: '1', FORCE_COLOR: '3', OTHER: 'x' }]], {
        shell: { FORCE_COLOR: '0' },
      });
      expect(resolved.process).toEqual({ FORCE_COLOR: '0', OTHER: 'x' });
      expect(resolved.subprocess).toEqual({ NO_COLOR: '1', FORCE_COLOR: '3', OTHER: 'x' });
    });
  });

  describe('values are plain text that reach every subprocess', () => {
    test('no shell processes them: ~ and $HOME stay as typed', () => {
      const resolved = sessionEnv([['user', { CLAUDE_CONFIG_DIR: '~/work', LOG: '$HOME/log' }]], {
        shell: { HOME: '/home/me' },
      });
      expect(resolved.subprocess.CLAUDE_CONFIG_DIR).toBe('~/work');
      expect(resolved.subprocess.LOG).toBe('$HOME/log');
    });

    test('a credential written here reaches every subprocess unmasked', () => {
      const resolved = sessionEnv([
        ['user', { OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer x' }],
      ]);
      expect(resolved.subprocess.OTEL_EXPORTER_OTLP_HEADERS).toBe('Authorization=Bearer x');
    });
  });
});
