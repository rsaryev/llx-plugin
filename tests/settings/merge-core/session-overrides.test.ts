/**
 * settings.md § Change a setting for one session ("A flag for that key ... `--model` for `model` and
 * `--effort` for `effortLevel`"; "An environment variable ... `ANTHROPIC_MODEL` for `model`"), §
 * Settings precedence ("Environment variables aren't a level in this stack ... `ANTHROPIC_MODEL`
 * exported in your shell applies over the `model` key from any file, while `ANTHROPIC_DEFAULT_MODEL`
 * applies only when no file sets `model`"), env-vars.md § Precedence ("`--model` and `/model`
 * override `ANTHROPIC_MODEL`, while `CLAUDE_CODE_EFFORT_LEVEL` overrides `--effort` and `/effort`"),
 * settings-reference.md § `effortLevel` ("`--effort` takes precedence over this key for one session,
 * and `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over both"), model-config.md § Setting your model.
 */
import { describe, expect, test } from 'bun:test';
import { resolveSessionValue, type SessionInput } from '../../../src/settings/general/index.ts';
import { spec } from '../../support/spec.ts';

const input = (over: Partial<SessionInput>): SessionInput => ({
  flags: {},
  env: {},
  settingsValue: undefined,
  ...over,
});

const modelSession = (flag: string, availableModels?: readonly string[]) =>
  input({ flags: { '--model': flag }, settingsValue: 'sonnet', availableModels });

spec('settingsMerge.settings.Change a setting for one session.A flag for that key', () => {
  describe('some keys have their own flag', () => {
    test('--model overrides the model key and ANTHROPIC_MODEL, whichever file set the key', () => {
      const session = input({
        flags: { '--model': 'opus' },
        env: { ANTHROPIC_MODEL: 'haiku' },
        settingsValue: 'sonnet',
      });
      expect(resolveSessionValue('model', session)).toEqual({ value: 'opus', from: '--model' });
    });

    test('--effort overrides effortLevel; the key answers when the flag is not given', () => {
      expect(
        resolveSessionValue(
          'effortLevel',
          input({ flags: { '--effort': 'low' }, settingsValue: 'high' }),
        ),
      ).toEqual({ value: 'low', from: '--effort' });
      expect(resolveSessionValue('effortLevel', input({ settingsValue: 'high' }))).toEqual({
        value: 'high',
        from: 'settings files',
      });
    });

    test('--effort covers modelSettings too: the level saved for the model is overridden, and the variable still comes first', () => {
      const saved = input({ flags: { '--effort': 'low' }, settingsValue: 'high' });
      expect(resolveSessionValue('modelSettings', saved)).toEqual({
        value: 'low',
        from: '--effort',
      });
      expect(
        resolveSessionValue(
          'modelSettings',
          input({ ...saved, env: { CLAUDE_CODE_EFFORT_LEVEL: 'xhigh' } }),
        )?.value,
      ).toBe('xhigh');
    });

    test('--permission-mode overrides permissions.defaultMode', () => {
      expect(
        resolveSessionValue(
          'permissions.defaultMode',
          input({ flags: { '--permission-mode': 'plan' }, settingsValue: 'acceptEdits' }),
        ),
      ).toEqual({ value: 'plan', from: '--permission-mode' });
      expect(
        resolveSessionValue('permissions.defaultMode', input({ settingsValue: 'acceptEdits' }))
          ?.from,
      ).toBe('settings files');
    });

    test('--model picks only from the models availableModels allows: a model outside it falls through to the next source', () => {
      expect(resolveSessionValue('model', modelSession('opus', ['sonnet', 'haiku']))).toEqual({
        value: 'sonnet',
        from: 'settings files',
      });
      expect(
        resolveSessionValue('model', modelSession('claude-sonnet-4-6', ['sonnet']))?.from,
      ).toBe('--model');
      expect(resolveSessionValue('model', modelSession('claude-opus-5-5', ['opus-5']))?.from).toBe(
        '--model',
      );
      expect(resolveSessionValue('model', modelSession('opus'))?.from).toBe('--model');
    });

    test('with availableModels empty every named selection is blocked, the key in a file included', () => {
      expect(
        resolveSessionValue(
          'model',
          input({ flags: { '--model': 'opus' }, settingsValue: 'sonnet', availableModels: [] }),
        ),
      ).toBeUndefined();
    });

    test('an unset flag does not hide the key', () => {
      expect(
        resolveSessionValue(
          'model',
          input({ flags: { '--model': undefined }, settingsValue: 'sonnet' }),
        )?.value,
      ).toBe('sonnet');
    });
  });
});

spec('settingsMerge.settings.Change a setting for one session.An environment variable', () => {
  describe("the key's paired variable", () => {
    test('ANTHROPIC_MODEL applies over the model key from any file, and --model overrides both', () => {
      expect(
        resolveSessionValue(
          'model',
          input({ env: { ANTHROPIC_MODEL: 'haiku' }, settingsValue: 'sonnet' }),
        ),
      ).toEqual({ value: 'haiku', from: 'ANTHROPIC_MODEL' });
    });

    test('ANTHROPIC_DEFAULT_MODEL applies only when no file sets model', () => {
      const env = { ANTHROPIC_DEFAULT_MODEL: 'opus' };
      expect(resolveSessionValue('model', input({ env, settingsValue: 'sonnet' }))?.value).toBe(
        'sonnet',
      );
      expect(resolveSessionValue('model', input({ env }))).toEqual({
        value: 'opus',
        from: 'ANTHROPIC_DEFAULT_MODEL',
      });
    });

    test('which one applies is decided per pair: CLAUDE_CODE_EFFORT_LEVEL overrides --effort, CLAUDE_CODE_AUTO_CONNECT_IDE is read before autoConnectIde', () => {
      expect(
        resolveSessionValue(
          'effortLevel',
          input({
            env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' },
            flags: { '--effort': 'low' },
            settingsValue: 'high',
          }),
        )?.value,
      ).toBe('max');
      expect(
        resolveSessionValue(
          'autoConnectIde',
          input({ env: { CLAUDE_CODE_AUTO_CONNECT_IDE: '0' }, settingsValue: '1' }),
        )?.value,
      ).toBe('0');
      expect(resolveSessionValue('autoConnectIde', input({ settingsValue: '1' }))?.value).toBe('1');
    });

    test('an empty variable is unset', () => {
      expect(
        resolveSessionValue(
          'model',
          input({ env: { ANTHROPIC_MODEL: '' }, settingsValue: 'sonnet' }),
        )?.value,
      ).toBe('sonnet');
    });

    test('nothing set anywhere is no value', () => {
      expect(resolveSessionValue('model', input({}))).toBeUndefined();
    });
  });
});
