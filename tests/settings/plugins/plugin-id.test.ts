/**
 * plugins/loading.md § "Find where a plugin came from" (an id is `<name>@<origin>`; `inline`,
 * `skills-dir` and `synced` are reserved origins), settings-reference.md § `pluginConfigs` (the
 * `@builtin` suffix, `agents-md@builtin` versus `cc-plugin-agents-md@builtin`) and § `prependPlugins`
 * (`sec-default@builtin`). The id helpers carry no requirement of their own: the keys that use them
 * prove their behaviour, so this file is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  guardIdForms,
  isGuardPluginId,
  parsePluginId,
} from '../../../src/settings/plugins/index.ts';
import { plain } from '../../support/settings-layers.ts';

describe('parsePluginId', () => {
  test('splits a name and an origin at the one @', () => {
    expect(plain(parsePluginId('code-formatter@team-tools'))).toEqual({
      name: 'code-formatter',
      origin: 'team-tools',
    });
    expect(plain(parsePluginId('notes@synced'))).toEqual({ name: 'notes', origin: 'synced' });
  });

  test('refuses a text that is not name@origin', () => {
    for (const text of ['', 'name', '@origin', 'name@', 'a@b@c', 'a b@c', 'a@b c']) {
      expect(parsePluginId(text)).toBeUndefined();
    }
  });
});

describe('the guard ids', () => {
  test('both spellings are the guard, nothing else is', () => {
    expect(isGuardPluginId('sec-default@builtin')).toBe(true);
    expect(isGuardPluginId('cc-plugin-sec-default@builtin')).toBe(true);
    expect(isGuardPluginId('sec-default@acme')).toBe(false);
    expect(plain(guardIdForms)).toEqual(['sec-default@builtin', 'cc-plugin-sec-default@builtin']);
  });
});
