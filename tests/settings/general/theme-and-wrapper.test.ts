/**
 * settings-reference.md § `theme` (the seven presets and `custom:<slug>` / `custom:<plugin-name>:<slug>`,
 * default `"dark"`, a value in `~/.claude.json` from an older version applies when no settings file sets
 * it); terminal-config.md § Create a custom theme (the slug is the file name without `.json`);
 * settings-reference.md § `processWrapper` (user or managed, a string, `CLAUDE_CODE_PROCESS_WRAPPER`
 * takes precedence, ignored on Windows); corporate-launcher.md § Format of the launcher value.
 */
import { describe, expect, test } from 'bun:test';
import {
  readProcessWrapper,
  readThemeSetting,
  resolveSessionValue,
} from '../../../src/settings/general/index.ts';
import { issuesOf } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const PRESETS = [
  'auto',
  'dark',
  'light',
  'dark-daltonized',
  'light-daltonized',
  'dark-ansi',
  'light-ansi',
] as const;

spec('settings.key.theme', () => {
  test('each of the seven presets is read as that preset', () => {
    for (const name of PRESETS) {
      expect(readThemeSetting(viewOf(['user', { theme: name }]))).toEqual({ preset: name });
    }
  });

  test('the docs example light-daltonized', () => {
    expect(readThemeSetting(viewOf(['user', { theme: 'light-daltonized' }]))).toEqual({
      preset: 'light-daltonized',
    });
  });

  test('the default is dark', () => {
    expect(readThemeSetting(viewOf())).toEqual({ preset: 'dark' });
  });

  test('custom:<slug> names a theme of ~/.claude/themes and custom:<plugin-name>:<slug> one of a plugin', () => {
    expect(readThemeSetting(viewOf(['user', { theme: 'custom:dracula' }]))).toEqual({
      custom: { slug: 'dracula' },
    });
    expect(readThemeSetting(viewOf(['user', { theme: 'custom:my-plugin:night' }]))).toEqual({
      custom: { plugin: 'my-plugin', slug: 'night' },
    });
  });

  test('a custom reference with a missing part, or a name that is neither a preset nor custom, is dropped with a warning', () => {
    for (const bad of ['custom:', 'custom::x', 'custom:a:', 'custom:a:b:c', 'solarized', 'Dark']) {
      expect(issuesOf('user', { theme: bad })[0]?.message).toContain('"theme" must be');
      expect(readThemeSetting(viewOf(['user', { theme: bad }]))).toEqual({ preset: 'dark' });
    }
  });

  test('any file carries it and the highest file wins; a dropped value leaves the lower file in force', () => {
    expect(
      readThemeSetting(viewOf(['user', { theme: 'light' }], ['project', { theme: 'auto' }])),
    ).toEqual({ preset: 'auto' });
    expect(
      readThemeSetting(viewOf(['user', { theme: 'light' }], ['project', { theme: 'bogus' }])),
    ).toEqual({ preset: 'light' });
  });

  test('a value in ~/.claude.json from an older version applies when no settings file sets it', () => {
    expect(readThemeSetting(viewOf(), 'light-ansi')).toEqual({ preset: 'light-ansi' });
    expect(readThemeSetting(viewOf(['user', { theme: 'light' }]), 'light-ansi')).toEqual({
      preset: 'light',
    });
    expect(readThemeSetting(viewOf(), 'custom:dracula')).toEqual({ custom: { slug: 'dracula' } });
    expect(readThemeSetting(viewOf(), 'bogus')).toEqual({ preset: 'dark' });
  });
});

spec('settings.key.processWrapper', () => {
  const wrapper = (
    settings: object,
    options: { env?: Record<string, string>; windows?: boolean } = {},
    scope: 'user' | 'managed' | 'project' | 'local' | 'flag' = 'user',
  ) =>
    readProcessWrapper(viewOf([scope, settings]), {
      env: options.env ?? {},
      windows: options.windows ?? false,
    });

  test('the docs example: a path with an argument, as an argv prefix', () => {
    expect(wrapper({ processWrapper: '/opt/corp/launcher --profile claude' })).toEqual({
      argv: ['/opt/corp/launcher', '--profile', 'claude'],
    });
  });

  test('user and managed settings carry it; project, local and --settings files never do', () => {
    expect(wrapper({ processWrapper: '/opt/l' }, {}, 'managed')).toEqual({ argv: ['/opt/l'] });
    for (const scope of ['project', 'local', 'flag'] as const) {
      expect(wrapper({ processWrapper: '/opt/l' }, {}, scope)).toBeUndefined();
    }
    expect(issuesOf('project', { processWrapper: '/opt/l' })[0]?.message).toContain(
      '"processWrapper" is not read from',
    );
  });

  test('unset by default, so background processes start unwrapped', () => {
    expect(wrapper({})).toBeUndefined();
  });

  test('CLAUDE_CODE_PROCESS_WRAPPER takes precedence over the key', () => {
    expect(
      wrapper(
        { processWrapper: '/from/key' },
        { env: { CLAUDE_CODE_PROCESS_WRAPPER: '/from/env' } },
      ),
    ).toEqual({ argv: ['/from/env'] });
  });

  test('Claude Code ignores the launcher on Windows and starts every process unwrapped', () => {
    expect(wrapper({ processWrapper: '/opt/l' }, { windows: true })).toBeUndefined();
    expect(
      wrapper({}, { windows: true, env: { CLAUDE_CODE_PROCESS_WRAPPER: '/opt/l' } }),
    ).toBeUndefined();
  });

  describe('the format of the value', () => {
    const argv = (value: string) => wrapper({ processWrapper: value });

    test('whitespace separates tokens and double quotes group a token with spaces', () => {
      expect(argv('/opt/l  --profile   "my profile"')).toEqual({
        argv: ['/opt/l', '--profile', 'my profile'],
      });
    });

    test("a single quote is an ordinary character, so 'a b' is two tokens", () => {
      expect(argv("/opt/l 'a b'")).toEqual({ argv: ['/opt/l', "'a", "b'"] });
    });

    test('a value that starts with [ is a JSON string array', () => {
      expect(argv('["/opt/corp/launcher", "--profile", "cc"]')).toEqual({
        argv: ['/opt/corp/launcher', '--profile', 'cc'],
      });
      expect(argv('["/opt/l", 3]')).toMatchObject({
        problem: expect.stringContaining('JSON array of strings'),
      });
      expect(argv('[not json')).toMatchObject({
        problem: expect.stringContaining('JSON array of strings'),
      });
    });

    test('there is no variable expansion or globbing: $HOME and * stay as typed', () => {
      expect(argv('/opt/l $HOME *.sh')).toEqual({ argv: ['/opt/l', '$HOME', '*.sh'] });
    });

    test('an unquoted operator is a configuration error, not reinterpreted', () => {
      for (const value of [
        '/opt/l ; rm -rf /',
        '/opt/l | tee x',
        '/opt/l && x',
        '/opt/l $(id)',
        '/opt/l & x',
      ]) {
        expect(argv(value)).toMatchObject({
          problem: expect.stringContaining('CLAUDE_CODE_PROCESS_WRAPPER:'),
        });
      }
    });

    test('an operator inside double quotes is an ordinary character', () => {
      expect(argv('/opt/l "a;b"')).toEqual({ argv: ['/opt/l', 'a;b'] });
    });

    test('an empty or unterminated value cannot be used, so Claude Code would refuse to start the process', () => {
      expect(argv('   ')).toMatchObject({ problem: expect.any(String) });
      expect(argv('/opt/l "open')).toMatchObject({ problem: expect.stringContaining('quote') });
    });
  });

  test('the per-session variable takes the same format as the key', () => {
    expect(wrapper({}, { env: { CLAUDE_CODE_PROCESS_WRAPPER: '/opt/l --x "a b"' } })).toEqual({
      argv: ['/opt/l', '--x', 'a b'],
    });
  });

  test('resolveSessionValue names the variable as the winning source', () => {
    expect(
      resolveSessionValue('processWrapper', {
        flags: {},
        env: { CLAUDE_CODE_PROCESS_WRAPPER: '/e' },
        settingsValue: '/k',
      }),
    ).toEqual({ value: '/e', from: 'CLAUDE_CODE_PROCESS_WRAPPER' });
  });
});

describe('the launcher variable in a repository file (cross-check with the env block)', () => {
  test('CLAUDE_CODE_PROCESS_WRAPPER in a project env block is ignored with a warning', () => {
    const found = issuesOf('project', { env: { CLAUDE_CODE_PROCESS_WRAPPER: '/evil' } });
    expect(found[0]?.message).toContain('CLAUDE_CODE_PROCESS_WRAPPER');
  });
});
