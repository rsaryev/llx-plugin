/**
 * The package's `exports` map (docs/API.md, "Entry points"): every subpath has the source condition
 * a path-linked host's tsc picks with `customConditions`, the built types, Bun's source, the built
 * module and a `default`; every subpath goes through `src/entry` (or the root and the test kit); the
 * SDK peers are only types, so they are optional.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import pkg from '../../package.json';

// `as const` keeps each pair a tuple, so a subpath's name and its conditions stay apart.
const subpaths = Object.entries(pkg.exports).flatMap(([name, target]) =>
  typeof target === 'string' ? [] : [[name, new Map(Object.entries(target))] as const],
);

describe('the exports map', () => {
  test('each subpath lists the source, types, bun, import and default conditions, in that order', () => {
    for (const [, conditions] of subpaths) {
      expect([...conditions.keys()]).toEqual([
        'llx-plugin-source',
        'types',
        'bun',
        'import',
        'default',
      ]);
      expect(conditions.get('llx-plugin-source')).toBe(conditions.get('bun'));
      expect(conditions.get('default')).toBe(conditions.get('import'));
    }
  });

  test('each source file exists and is the root, the test kit or an entry of src/entry', () => {
    for (const [name, conditions] of subpaths) {
      const source = conditions.get('bun') ?? '';
      expect(existsSync(new URL(`../../${source}`, import.meta.url))).toBe(true);
      const allowed = name === '.' || name === './testing' || source.startsWith('./src/entry/');
      expect(allowed).toBe(true);
    }
  });

  test('./package.json is exported, and the SDK peers are optional', () => {
    expect(pkg.exports['./package.json']).toBe('./package.json');
    expect(Object.keys(pkg.peerDependenciesMeta)).toEqual(Object.keys(pkg.peerDependencies));
    for (const meta of Object.values(pkg.peerDependenciesMeta)) {
      expect(meta).toEqual({ optional: true });
    }
  });
});
