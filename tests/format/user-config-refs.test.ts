/** plugins/manifest-reference.md § Reference a saved value: `${user_config.KEY}`, read in one place. */
import { expect, test } from 'bun:test';
import {
  USER_CONFIG_KEY,
  replaceUserConfigReferences,
  userConfigKeyIn,
  userConfigReferences,
  validOptionKeyIn,
} from '../../src/format/user-config-refs.ts';

test('the keys a text references, in order, other braces aside', () => {
  expect(
    userConfigReferences('--k=${user_config.api_key} ${HOME} ${user_config.srv.token}'),
  ).toEqual(['api_key', 'srv.token']);
  expect(userConfigReferences('${user_config.} $user_config.x')).toEqual([]);
});

test('a reference is replaced; other variables stay as written', () => {
  expect(replaceUserConfigReferences('${user_config.a}/${HOME}', (key) => `<${key}>`)).toBe(
    '<a>/${HOME}',
  );
});

test('the key of one reference, and the option-key rule', () => {
  expect(userConfigKeyIn('user_config.KEY_1')).toBe('KEY_1');
  expect(userConfigKeyIn('HOME')).toBeUndefined();
  expect(USER_CONFIG_KEY.test('_ok9')).toBe(true);
  expect(USER_CONFIG_KEY.test('9no')).toBe(false);
});

test('validOptionKeyIn names an option only for a valid option key', () => {
  expect(validOptionKeyIn('user_config.api_key')).toBe('api_key');
  expect(validOptionKeyIn('user_config.2fa')).toBeUndefined();
  expect(validOptionKeyIn('user_config.a-b')).toBeUndefined();
  expect(validOptionKeyIn('other.x')).toBeUndefined();
});
