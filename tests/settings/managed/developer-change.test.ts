/**
 * managed-settings.md § What a developer can change (the model and the auto-compact window for a
 * session); settings-reference.md, `autoCompactWindow` (per-session overrides).
 */
import { expect, test } from 'bun:test';
import { resolveSessionValue } from '../../../src/settings/general/session-overrides.ts';
import { spec } from '../../support/spec.ts';

const CHANGE = 'policy.managed.What a developer can change';

spec(`${CHANGE}.The model for a session`, () => {
  const input = (
    flags: Record<string, string>,
    env: Record<string, string>,
    availableModels?: string[],
  ) => ({
    flags,
    env,
    settingsValue: 'sonnet',
    ...(availableModels === undefined ? {} : { availableModels }),
  });

  test('a managed model is a default: --model and ANTHROPIC_MODEL still pick the model for that session', () => {
    expect(resolveSessionValue('model', input({ '--model': 'opus' }, {}))).toEqual({
      value: 'opus',
      from: '--model',
    });
    expect(resolveSessionValue('model', input({}, { ANTHROPIC_MODEL: 'haiku' }))).toEqual({
      value: 'haiku',
      from: 'ANTHROPIC_MODEL',
    });
    expect(resolveSessionValue('model', input({}, {}))).toEqual({
      value: 'sonnet',
      from: 'settings files',
    });
  });

  test('availableModels restricts the choice', () => {
    const restricted = resolveSessionValue('model', input({ '--model': 'opus' }, {}, ['sonnet']));
    expect(restricted?.from).not.toBe('--model');
  });
});

spec(`${CHANGE}.The auto-compact window for a session`, () => {
  const input = (flags: Record<string, string>, env: Record<string, string>) => ({
    flags,
    env,
    settingsValue: '150000',
  });

  test('a managed autoCompactWindow is a default: the --autocompact flag still sets the window for that session', () => {
    expect(
      resolveSessionValue('autoCompactWindow', input({ '--autocompact': '500k' }, {})),
    ).toEqual({ value: '500k', from: '--autocompact' });
    expect(resolveSessionValue('autoCompactWindow', input({}, {}))).toEqual({
      value: '150000',
      from: 'settings files',
    });
  });

  test('CLAUDE_CODE_AUTO_COMPACT_WINDOW takes precedence over both', () => {
    const resolved = resolveSessionValue(
      'autoCompactWindow',
      input({ '--autocompact': '500k' }, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000' }),
    );
    expect(resolved).toEqual({ value: '200000', from: 'CLAUDE_CODE_AUTO_COMPACT_WINDOW' });
  });

  test('a variable outside 100000 to 1000000 or not a token count is ignored', () => {
    for (const value of ['200', '2000000', 'lots', '99k']) {
      const resolved = resolveSessionValue(
        'autoCompactWindow',
        input({ '--autocompact': '500k' }, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: value }),
      );
      expect(resolved?.from).toBe('--autocompact');
    }
  });

  test('suffixed values such as 200k and 1M are token counts', () => {
    for (const value of ['200k', '1M', '100000', '1000000']) {
      const resolved = resolveSessionValue(
        'autoCompactWindow',
        input({}, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: value }),
      );
      expect(resolved?.from).toBe('CLAUDE_CODE_AUTO_COMPACT_WINDOW');
    }
  });
});
