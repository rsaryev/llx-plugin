/**
 * The choices spec/judgments.md records for the path rules where permissions.md is silent: what
 * "a single directory segment" covers, `./path` and `../path`, the managed tiers' anchor, and the
 * tools no page routes. Outside spec() on purpose: a judgment never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { allows, asks, denies, withPaths } from '../support/path-rules.ts';

describe('which patterns are "a single directory segment"', () => {
  test('one directory and a file pattern is widened for deny and ask, not for allow', () => {
    expect(denies('Read(src/index.ts)', '/work/app/vendor/src/index.ts')).toBe(true);
    expect(denies('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
    expect(asks('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
    expect(allows('Read(src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(false);
    expect(allows('Read(src/*.ts)', '/work/app/src/a.ts')).toBe(true);
  });

  test('two directories, a leading ** or a leading slash are other shapes', () => {
    expect(denies('Read(src/lib/*.ts)', '/work/app/vendor/src/lib/a.ts')).toBe(false);
    expect(denies('Read(/src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(false);
    expect(denies('Read(**/src/*.ts)', '/work/app/vendor/src/a.ts')).toBe(true);
  });
});

describe('./path and ../path', () => {
  test('./.env is the bare filename .env, as the docs list one pattern type for both', () => {
    expect(denies('Read(./.env)', '/work/app/pkg/.env')).toBe(true);
  });

  test('a ../ prefix names the parent of the current directory', () => {
    expect(denies('Read(../shared/**)', '/work/shared/key')).toBe(true);
    expect(denies('Read(../shared/**)', '/work/app/shared/key')).toBe(false);
  });
});

describe('anchors the source table leaves open', () => {
  test('the managed tiers anchor /path at the primary working directory', () => {
    for (const kind of ['managed', 'embedder-managed'] as const) {
      expect(denies('Read(/secrets/**)', '/work/app/secrets/k', { source: { kind } })).toBe(true);
    }
  });

  test('a relative --settings file resolves against the primary working directory', () => {
    const source = { kind: 'flag-settings', file: 'cfg/team.json' } as const;
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    expect(denies('Read(/s/**)', '/work/app/cfg/s/k', { source, ctx })).toBe(true);
  });
});

describe('tools the docs do not route', () => {
  test('MultiEdit is covered by no path rule', () => {
    expect(denies('Edit(src/**)', '/work/app/src/a.ts', { tool: 'MultiEdit' })).toBe(false);
  });
});
