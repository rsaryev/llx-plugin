/**
 * permissions.md § How deep a pattern matches: "A rule only matches files under its anchor",
 * bare filenames follow gitignore ("`Read(.env)` and `Read(**\/.env)` are equivalent"), the table of
 * deny rules (`.env` in a parent directory or another project is not blocked; `Read(//**\/.env)`
 * blocks any `.env` anywhere), the single-directory-segment rule ("Allow rules: `Edit(src/**)`
 * matches only `<cwd>/src` ... Deny and ask rules: ... at any depth"), "Every other pattern shape
 * matches at the same depth in every rule type", and the src/vendor project and its table.
 */
import { expect, test } from 'bun:test';
import { allows, asks, denies } from '../support/path-rules.ts';
import { spec } from '../support/spec.ts';

const ENV_HERE = '/work/app/.env';
const ENV_NESTED = '/work/app/packages/api/.env';
const ENV_PARENT = '/work/.env';
const ENV_OTHER_PROJECT = '/work/other/.env';

spec('permissions.rule.Read(./.env)', () => {
  test('matches reading the .env file in the current directory', () => {
    expect(denies('Read(./.env)', ENV_HERE)).toBe(true);
    expect(asks('Read(./.env)', ENV_HERE)).toBe(true);
    expect(allows('Read(./.env)', ENV_HERE)).toBe(true);
  });

  test('is anchored under the current directory: a parent, another project, another file', () => {
    for (const path of [ENV_PARENT, ENV_OTHER_PROJECT, '/work/app/.env.local', '/work/app/env']) {
      expect([path, denies('Read(./.env)', path)]).toEqual([path, false]);
    }
  });
});

spec('permissions.rule.Read(.env)', () => {
  test('blocks any .env at or under the current directory', () => {
    for (const path of [ENV_HERE, ENV_NESTED]) {
      expect([path, denies('Read(.env)', path)]).toEqual([path, true]);
    }
  });

  test('does not block a .env in a parent directory or another project', () => {
    for (const path of [ENV_PARENT, ENV_OTHER_PROJECT]) {
      expect([path, denies('Read(.env)', path)]).toEqual([path, false]);
    }
  });

  test('is equivalent to Read(**/.env), for every rule type', () => {
    const paths = [ENV_HERE, ENV_NESTED, ENV_PARENT, ENV_OTHER_PROJECT, '/work/app/a.env'];
    for (const check of [allows, asks, denies]) {
      for (const path of paths) {
        expect([path, check('Read(.env)', path)]).toEqual([path, check('Read(**/.env)', path)]);
      }
    }
  });
});

spec('permissions.rule.Read(**/.env)', () => {
  test('blocks any .env at or under the current directory', () => {
    for (const path of [ENV_HERE, ENV_NESTED]) {
      expect([path, denies('Read(**/.env)', path)]).toEqual([path, true]);
    }
  });

  test('does not block a .env in a parent directory or another project', () => {
    for (const path of [ENV_PARENT, ENV_OTHER_PROJECT]) {
      expect([path, denies('Read(**/.env)', path)]).toEqual([path, false]);
    }
  });
});

spec('permissions.rule.Read(//**/.env)', () => {
  test('blocks any .env anywhere on the filesystem', () => {
    for (const path of [
      ENV_HERE,
      ENV_NESTED,
      ENV_PARENT,
      ENV_OTHER_PROJECT,
      '/.env',
      '/home/alice/.ssh/.env',
    ]) {
      expect([path, denies('Read(//**/.env)', path)]).toEqual([path, true]);
    }
  });

  test('blocks nothing but .env files: it is anchored at the filesystem root', () => {
    for (const path of ['/work/app/.env.local', '/work/app/env', '/work/app/a.env']) {
      expect([path, denies('Read(//**/.env)', path)]).toEqual([path, false]);
    }
  });
});

const APP = '/work/app/src/app.ts';
const NESTED = '/work/app/vendor/pkg/src/lib.js';

spec('permissions.rule.Edit(src/**)', () => {
  test('as an allow rule it matches <cwd>/src and the files under it, not a nested copy', () => {
    expect(allows('Edit(src/**)', APP, { tool: 'Edit' })).toBe(true);
    expect(allows('Edit(src/**)', NESTED, { tool: 'Edit' })).toBe(false);
  });

  test('as a deny or ask rule it matches a src directory at any depth under the cwd', () => {
    for (const check of [denies, asks]) {
      expect(check('Edit(src/**)', APP, { tool: 'Edit' })).toBe(true);
      expect(check('Edit(src/**)', NESTED, { tool: 'Edit' })).toBe(true);
    }
  });

  test('a deny of Read(secrets/**) also applies to nested copies, an allow does not', () => {
    const nested = '/work/app/pkg/secrets/key';
    expect(denies('Read(secrets/**)', nested)).toBe(true);
    expect(allows('Read(secrets/**)', nested)).toBe(false);
    expect(allows('Read(secrets/**)', '/work/app/secrets/key')).toBe(true);
  });

  test('a copy outside the current directory is never reached, even by a deny', () => {
    expect(denies('Edit(src/**)', '/work/other/src/a.ts', { tool: 'Edit' })).toBe(false);
  });
});

spec('permissions.rule.Edit(/src/**)', () => {
  test('matches only the anchored location in every rule type', () => {
    for (const check of [allows, asks, denies]) {
      expect(check('Edit(/src/**)', APP, { tool: 'Edit' })).toBe(true);
      expect(check('Edit(/src/**)', NESTED, { tool: 'Edit' })).toBe(false);
    }
  });

  test('a directory path with two segments also matches only at its anchored location', () => {
    for (const check of [allows, asks, denies]) {
      expect(
        check('Edit(src/components/**)', '/work/app/src/components/a.tsx', { tool: 'Edit' }),
      ).toBe(true);
      expect(
        check('Edit(src/components/**)', '/work/app/vendor/src/components/a.tsx', { tool: 'Edit' }),
      ).toBe(false);
    }
  });
});

spec('permissions.rule.Edit(**/src/**)', () => {
  test('matches at any depth in every rule type', () => {
    for (const check of [allows, asks, denies]) {
      expect(check('Edit(**/src/**)', APP, { tool: 'Edit' })).toBe(true);
      expect(check('Edit(**/src/**)', NESTED, { tool: 'Edit' })).toBe(true);
    }
  });

  test('"To allow a directory name at any depth, write Edit(**/src/**)"', () => {
    expect(allows('Edit(**/src/**)', '/work/app/a/b/src/c.ts', { tool: 'Edit' })).toBe(true);
    expect(allows('Edit(**/src/**)', '/work/app/a/b/lib/c.ts', { tool: 'Edit' })).toBe(false);
  });
});
