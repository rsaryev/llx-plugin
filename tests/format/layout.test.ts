/**
 * plugins/manifest-reference.md § Fields (`experimental.themes` and `experimental.monitors`: "A
 * top-level `themes` key still loads, with a `claude plugin validate` warning") and § Standard layout.
 * The registry's behaviour (what is found where, how each key combines) is proven through discovery in
 * tests/loading; this file covers what the registry itself decides: which manifest key wins and that the
 * layout has an entry for every component kind. Which key wins when both are set is the kit's judgment.
 */
import { describe, expect, test } from 'bun:test';
import { COMPONENT_KINDS, STANDARD_LAYOUT, declaredKey } from '../../src/index.ts';
import { manifestOf } from '../support/plugin-folder.ts';

describe('the standard layout registry (judgments)', () => {
  test('every component kind has an entry and every entry is a kind', () => {
    expect(Object.keys(STANDARD_LAYOUT).toSorted()).toEqual([...COMPONENT_KINDS].toSorted());
  });

  test('declaredKey reports the key that is set and its value; none set is undefined', () => {
    const manifest = manifestOf({ name: 'p', commands: ['./extras/'] });
    expect(declaredKey(manifest, 'commands')).toEqual({ key: 'commands', value: ['./extras/'] });
    expect(declaredKey(manifest, 'agents')).toBeUndefined();
    expect(declaredKey(undefined, 'commands')).toBeUndefined();
  });

  test('experimental.themes wins over the top-level themes alias when both are set', () => {
    const both = manifestOf({ name: 'p', themes: './old', experimental: { themes: './new' } });
    expect(declaredKey(both, 'themes')).toEqual({ key: 'experimental.themes', value: './new' });
    const alias = manifestOf({ name: 'p', themes: './old' });
    expect(declaredKey(alias, 'themes')).toEqual({ key: 'themes', value: './old' });
  });

  test('only a key that replaces its default has a folder the warning can name', () => {
    const replacing = COMPONENT_KINDS.filter((kind) => STANDARD_LAYOUT[kind].combine === 'replace');
    expect([...replacing].toSorted()).toEqual([
      'agents',
      'commands',
      'monitors',
      'outputStyles',
      'themes',
      'workflows',
    ]);
    for (const kind of COMPONENT_KINDS) {
      expect(STANDARD_LAYOUT[kind].folder !== undefined).toBe(replacing.includes(kind));
    }
  });
});
