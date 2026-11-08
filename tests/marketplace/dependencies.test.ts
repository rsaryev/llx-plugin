/**
 * plugins/dependencies.md § Declare a dependency with a version constraint (a dependency is a
 * string, `"name"` or `"name@marketplace"`, or an object whose `name`, `version` and `marketplace`
 * are strings and `name` is required; the marketplace is the declaring plugin's own unless set; the
 * `version` is a node-semver range), § Test a plugin and its dependency locally (a local copy
 * satisfies the entry and no range is checked against it), § Dependencies when your plugin loads
 * from claude.ai (the `@synced` rule); plugins/troubleshooting.md § Dependency errors (the quoted
 * messages). What the docs leave open (an empty `version`, the text after a quoted prefix) is
 * outside `spec([...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  checkDependency,
  checkInstalledDependency,
  normalizeDependency,
} from '../../src/marketplace/dependencies.ts';
import { spec } from '../support/spec.ts';

const MARKETPLACE = 'your-marketplace';
const PATH = 'dependencies[0]';

const normalized = (value: unknown, ...declaring: [string | undefined] | []) =>
  normalizeDependency(value, declaring.length === 0 ? MARKETPLACE : declaring[0], PATH);

const errorOf = (value: unknown): string => {
  const found = normalized(value);
  expect('severity' in found).toBe(true);
  return 'message' in found ? found.message : '';
};

spec('dependencies.field.name', () => {
  test('a string is the plugin name, looked up in the declaring plugin marketplace', () => {
    expect(normalized('audit-logger')).toEqual({ name: 'audit-logger', marketplace: MARKETPLACE });
  });

  test('an object takes its name from `name`, in the same marketplace', () => {
    expect(normalized({ name: 'secrets-vault', version: '~2.1.0' })).toEqual({
      name: 'secrets-vault',
      marketplace: MARKETPLACE,
      range: '~2.1.0',
    });
  });

  test('`name` is required: an object without one, or with an empty or non-string one, is an error', () => {
    for (const bad of [{ version: '^1.0' }, { name: '' }, { name: 5 }, { name: ['a'] }]) {
      const found = normalized(bad);
      expect(found).toMatchObject({ severity: 'error', path: `${PATH}.name` });
    }
    expect(errorOf({ version: '^1.0' })).toContain('"name"');
  });

  test('an entry that is neither a string nor an object, or an empty string, is an error', () => {
    for (const bad of [5, null, true, ['a'], '']) {
      expect(normalized(bad)).toMatchObject({ severity: 'error', path: PATH });
    }
  });

  test('a name is a plugin id part, as it appears in its marketplace entry: one that breaks the grammar can never resolve', () => {
    for (const bad of ['a@b@c', ' ', 'a b', '-a', 'a/b', 'a\nb']) {
      expect(normalized(bad)).toMatchObject({ severity: 'error', path: PATH });
      expect(normalized({ name: bad })).toMatchObject({ severity: 'error', path: `${PATH}.name` });
    }
    expect(normalized('a@b@c')).toMatchObject({ severity: 'error' });
    expect(normalized('a.b_c-1')).toEqual({ name: 'a.b_c-1', marketplace: MARKETPLACE });
  });
});

spec('dependencies.field.marketplace', () => {
  test('`name@marketplace` resolves the name in that other marketplace', () => {
    expect(normalized('audit-logger@shared-libs')).toEqual({
      name: 'audit-logger',
      marketplace: 'shared-libs',
    });
  });

  test('an object `marketplace` resolves the name there, and keeps its version range', () => {
    expect(
      normalized({ name: 'audit-logger', marketplace: 'shared-libs', version: '^2.0' }),
    ).toEqual({
      name: 'audit-logger',
      marketplace: 'shared-libs',
      range: '^2.0',
    });
  });

  test('without `marketplace` the declaring plugin marketplace applies, and none for a plugin with no marketplace', () => {
    expect(normalized({ name: 'audit-logger' }, 'other-marketplace')).toEqual({
      name: 'audit-logger',
      marketplace: 'other-marketplace',
    });
    expect(normalized({ name: 'audit-logger' }, undefined)).toEqual({ name: 'audit-logger' });
  });

  test('`marketplace` is a string: a non-string or empty one, or a `name@` with nothing after it, is an error', () => {
    for (const bad of [{ name: 'a', marketplace: 5 }, { name: 'a', marketplace: '' }, 'a@', '@m']) {
      expect(normalized(bad)).toMatchObject({ severity: 'error' });
    }
    expect(normalized({ name: 'a', marketplace: 5 })).toMatchObject({
      path: `${PATH}.marketplace`,
    });
  });

  test('a marketplace is a plugin id part too: one that breaks the grammar is an error on the field', () => {
    for (const bad of ['b@c', 'a b', '-m', 'm/n']) {
      expect(normalized({ name: 'a', marketplace: bad })).toMatchObject({
        severity: 'error',
        path: `${PATH}.marketplace`,
      });
    }
    expect(normalized('a@b@c')).toMatchObject({ severity: 'error', path: PATH });
  });

  describe('a plugin loaded from claude.ai (`<name>@synced`, no marketplace)', () => {
    const dep = { name: 'audit-logger', marketplace: 'shared-libs', range: '^2.0' };
    const synced = (found: Parameters<typeof checkDependency>[1]) =>
      checkDependency(dep, found, true);

    test('is met by the dependency installed from the named marketplace and enabled', () => {
      expect(synced({ marketplace: { version: '2.3.0', enabled: true } })).toBeUndefined();
    });

    test('checks the entry range against the installed copy', () => {
      expect(synced({ marketplace: { version: '3.0.0', enabled: true } })?.message).toBe(
        'Requires "audit-logger@shared-libs" ^2.0, installed 3.0.0',
      );
    });

    test('is met by an enabled claude.ai plugin of the same name, checked against its version', () => {
      expect(synced({ claudeAi: { version: '2.1.0', enabled: true } })).toBeUndefined();
      expect(synced({ claudeAi: { version: '1.0.0', enabled: true } })).toMatchObject({
        severity: 'error',
      });
    });

    test('a claude.ai plugin that states no version passes the range check', () => {
      expect(synced({ claudeAi: { enabled: true } })).toBeUndefined();
    });

    test('a disabled claude.ai plugin does not meet it', () => {
      expect(synced({ claudeAi: { version: '2.1.0', enabled: false } })).toMatchObject({
        severity: 'error',
      });
    });

    test('a marketplace copy that is installed but out of range is the error when no claude.ai plugin helps', () => {
      expect(synced({ marketplace: { version: '1.0.0', enabled: true } })?.message).toContain(
        'Requires "audit-logger@shared-libs" ^2.0, installed 1.0.0',
      );
    });

    test('a plugin that does not load from claude.ai is not met by a claude.ai plugin, and the message says why', () => {
      const found = checkDependency(dep, { claudeAi: { version: '2.1.0', enabled: true } }, false);
      expect(found?.message).toContain('Dependency "audit-logger@shared-libs" is not installed');
      expect(found?.message).toContain(
        '"audit-logger@synced" is loaded from your claude.ai account but meets a marketplace dependency only for other claude.ai plugins',
      );
    });

    test('a disabled claude.ai plugin is not loaded, so the @synced note is not added for a plugin that does not load from claude.ai', () => {
      const found = checkDependency(dep, { claudeAi: { version: '2.1.0', enabled: false } }, false);
      expect(found?.message).toBe('Dependency "audit-logger@shared-libs" is not installed');
    });

    test('a plugin that does not load from claude.ai is met by the marketplace copy as usual', () => {
      expect(
        checkDependency(dep, { marketplace: { version: '2.0.0', enabled: true } }, false),
      ).toBeUndefined();
    });
  });
});

spec(
  [
    'dependencies.field.version',
    'install.troubleshooting.Dependency errors.has an invalid version requirement',
  ],
  () => {
    test('the documented ranges are accepted as the constraint: ~2.1.0, ^2.0, >=1.4 and =2.1.0', () => {
      for (const range of ['~2.1.0', '^2.0', '>=1.4', '=2.1.0']) {
        expect(normalized({ name: 'secrets-vault', version: range })).toMatchObject({ range });
      }
    });

    test('`version` is a string, and a range that is not valid semver is an invalid version requirement', () => {
      expect(normalized({ name: 'a', version: 2 })).toMatchObject({
        severity: 'error',
        path: `${PATH}.version`,
      });
      expect(errorOf({ name: 'secrets-vault', version: 'not a range' })).toContain(
        'has an invalid version requirement',
      );
      expect(errorOf({ name: 'secrets-vault', version: 'not a range' })).toContain(
        '"secrets-vault@your-marketplace"',
      );
    });

    test('a dependency with no `version` carries no range and tracks what its marketplace provides', () => {
      expect(normalized('audit-logger')).not.toHaveProperty('range');
    });

    test('an installed version outside the range is `Requires "<dep>" <range>, installed <version>`', () => {
      const dep = { name: 'secrets-vault', marketplace: MARKETPLACE, range: '~2.1.0' };
      expect(checkInstalledDependency(dep, { version: '3.0.0', enabled: true })).toEqual({
        severity: 'error',
        path: 'dependencies.secrets-vault@your-marketplace',
        message: 'Requires "secrets-vault@your-marketplace" ~2.1.0, installed 3.0.0',
        errorType: 'dependency-version-unsatisfied',
      });
      expect(checkInstalledDependency(dep, { version: '2.1.7', enabled: true })).toBeUndefined();
    });

    test('a range does not match a pre-release version unless it opts in with a suffix such as ^2.0.0-0', () => {
      const plain = { name: 'a', marketplace: MARKETPLACE, range: '^2.0.0' };
      const optIn = { name: 'a', marketplace: MARKETPLACE, range: '^2.0.0-0' };
      const beta = { version: '2.0.0-beta.1', enabled: true };
      expect(checkInstalledDependency(plain, beta)).toMatchObject({ severity: 'error' });
      expect(checkInstalledDependency(optIn, beta)).toBeUndefined();
    });

    test('a plugin.json that sets no version satisfies no constraint', () => {
      const dep = { name: 'a', marketplace: MARKETPLACE, range: '>=0.0.0' };
      expect(checkInstalledDependency(dep, { enabled: true })).toMatchObject({ severity: 'error' });
    });

    test('a version constraint is not checked against a local --plugin-dir copy', () => {
      const dep = { name: 'a', marketplace: MARKETPLACE, range: '~2.1.0' };
      expect(checkInstalledDependency(dep, { enabled: true, local: true })).toBeUndefined();
      expect(
        checkInstalledDependency(dep, { version: '9.9.9', enabled: true, local: true }),
      ).toBeUndefined();
    });
  },
);

describe('judgments (outside spec)', () => {
  test('an empty or blank `version` is no constraint, as node-semver reads "" as any version', () => {
    expect(normalized({ name: 'a', version: '' })).not.toHaveProperty('range');
    expect(normalized({ name: 'a', version: '  ' })).not.toHaveProperty('range');
  });

  test('a version the installed copy states that is not semver satisfies no range', () => {
    const dep = { name: 'a', marketplace: MARKETPLACE, range: '>=1.0.0' };
    expect(checkInstalledDependency(dep, { version: 'latest', enabled: true })?.message).toBe(
      'Requires "a@your-marketplace" >=1.0.0, installed latest',
    );
  });

  test('an installed copy with no version is reported as having no version', () => {
    const dep = { name: 'a', marketplace: MARKETPLACE, range: '>=1.0.0' };
    expect(checkInstalledDependency(dep, { enabled: true })?.message).toBe(
      'Requires "a@your-marketplace" >=1.0.0, installed (no version)',
    );
  });

  test('an extra key of a dependency object is ignored', () => {
    expect(normalized({ name: 'a', extra: 1 })).toEqual({ name: 'a', marketplace: MARKETPLACE });
  });

  test('the first @ splits `name@marketplace`, so a second one is part of the marketplace and refused by the id grammar', () => {
    expect(normalized('a@b@c')).toMatchObject({ severity: 'error', path: PATH });
    expect(errorOf('a@b@c')).toContain('"b@c"');
  });
});
