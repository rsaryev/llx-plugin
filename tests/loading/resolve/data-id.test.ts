/**
 * plugins/manifest-reference.md § Environment variables: `${CLAUDE_PLUGIN_DATA}` resolves to
 * `~/.claude/plugins/data/<id>/`, where `<id>` is the plugin identifier with every character
 * other than a letter, digit, `_`, or `-` replaced by `-`.
 */
import { describe, expect, test } from 'bun:test';
import { pluginDataId } from '../../../src/loading/resolve/data-id.ts';
import { spec } from '../../support/spec.ts';

spec('environment.variable.${CLAUDE_PLUGIN_DATA}', () => {
  test('the doc example: name@marketplace becomes name-marketplace', () => {
    expect(pluginDataId('my-plugin@my-marketplace')).toBe('my-plugin-my-marketplace');
  });
  test('letters, digits, underscore and hyphen stay', () => {
    expect(pluginDataId('Plugin_2-x')).toBe('Plugin_2-x');
  });
  test('every other character is replaced by a hyphen, one for one', () => {
    expect(pluginDataId('a.b c/d@e:f')).toBe('a-b-c-d-e-f');
    expect(pluginDataId('a@@b')).toBe('a--b');
  });
  test('a character outside the basic plane is one character', () => {
    expect(pluginDataId('a\u{1F600}b')).toBe('a-b');
  });
});

// Judgment (spec/judgments.md): the docs say "letters" without saying ASCII.
describe('pluginDataId (judgment)', () => {
  test('a letter outside ASCII is replaced: letters are A-Z and a-z', () => {
    expect(pluginDataId('caf\u00e9@shop')).toBe('caf--shop');
    expect(pluginDataId('\u043f\u043b\u0430\u0433\u0438\u043d')).toBe('------');
  });
});
