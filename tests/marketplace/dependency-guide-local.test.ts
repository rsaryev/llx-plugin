/**
 * plugins/dependencies.md § Test a plugin and its dependency locally (`claude --plugin-dir
 * ./my-dependency --plugin-dir ./my-plugin`: the local copy satisfies the dependency entry with no
 * install; no `version` is needed and no range is checked against it; an entry that names a
 * marketplace also matches it on Claude Code v2.1.242 or later; a disabled copy disables the plugin
 * at the next load with an error ending `is disabled — enable it or remove the dependency`, naming
 * `<name>@inline`; without the flag the dependency is reported as not installed; a parent folder
 * passed once loads each child folder with a plugin.json, from v2.1.265).
 */
import { describe, expect, test } from 'bun:test';
import { namesMarketplace } from '../../src/marketplace/dependencies.ts';
import {
  checkDeclaredDependency,
  findDependencyCopy,
  type LocalCopy,
} from '../../src/marketplace/dependency-graph.ts';
import { installClosure } from '../../src/marketplace/dependency-install-plan.ts';
import { pluginDirFolders } from '../../src/marketplace/plugin-dir-folders.ts';
import { dep, facts, installed, plugin } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const entry = (value: unknown = 'my-dependency') => dep(value, 'm');
const withLocal = (...copies: LocalCopy[]) => facts([], [], { localCopies: copies });
const local = (enabled = true, version?: string): LocalCopy => ({
  name: 'my-dependency',
  enabled,
  ...(version === undefined ? {} : { version }),
});

spec('dependencies.guide.Test a plugin and its dependency locally', () => {
  test('the local copy of the dependency satisfies the entry, so it need not be installed from its marketplace', () => {
    expect(checkDeclaredDependency(entry(), withLocal(local()))).toBeUndefined();
    const have = facts(
      [plugin('my-plugin', { manifest: ['my-dependency'] }), plugin('my-dependency')],
      [],
      { localCopies: [local()] },
    );
    const result = installClosure(
      { root: 'my-plugin@m', scope: 'user', operation: 'reload-plugins' },
      have,
    );
    expect(result.steps).toEqual([]);
    expect(result.leftOut).toEqual([]);
  });

  test('without the dependency --plugin-dir flag, the error reports the dependency as not installed', () => {
    expect(checkDeclaredDependency(entry(), withLocal())?.message).toBe(
      'Dependency "my-dependency@m" is not installed',
    );
    expect(checkDeclaredDependency(entry(), withLocal())?.errorType).toBe('dependency-unsatisfied');
  });

  test('once the dependency is installed from its marketplace, that copy meets the entry', () => {
    const have = facts([], [installed('my-dependency@m', { version: '1.2.0' })], {
      localCopies: [],
    });
    expect(findDependencyCopy(entry(), have)).toEqual({ enabled: true, version: '1.2.0' });
  });

  test('a parent folder passed once loads each child folder that has a plugin.json; a plugin folder loads itself', () => {
    const listing = {
      hasManifest: false,
      children: [
        { path: 'work/my-dependency', hasManifest: true },
        { path: 'work/my-plugin', hasManifest: true },
        { path: 'work/notes', hasManifest: false },
      ],
    };
    expect(pluginDirFolders('work', listing)).toEqual(['work/my-dependency', 'work/my-plugin']);
    expect(
      pluginDirFolders('work/my-plugin', { hasManifest: true, children: listing.children }),
    ).toEqual(['work/my-plugin']);
    expect(pluginDirFolders('work', listing, '2.1.265')).toHaveLength(2);
  });

  test('before Claude Code 2.1.265 a folder that is not a plugin loads nothing', () => {
    const listing = { hasManifest: false, children: [{ path: 'work/a', hasManifest: true }] };
    expect(pluginDirFolders('work', listing, '2.1.264')).toEqual([]);
  });
});

spec('dependencies.guide.Test a plugin and its dependency locally.No version needed', () => {
  test('a version constraint is not checked against a local copy, whether its plugin.json has a version or not', () => {
    const constrained = entry({ name: 'my-dependency', version: '~2.1.0' });
    expect(checkDeclaredDependency(constrained, withLocal(local()))).toBeUndefined();
    expect(checkDeclaredDependency(constrained, withLocal(local(true, '9.9.9')))).toBeUndefined();
  });

  test('the same constraint is checked against a copy installed from the marketplace, which without a version satisfies none', () => {
    const constrained = entry({ name: 'my-dependency', version: '~2.1.0' });
    const have = facts([], [installed('my-dependency@m', { version: '9.9.9' })]);
    expect(checkDeclaredDependency(constrained, have)?.message).toBe(
      'Requires "my-dependency@m" ~2.1.0, installed 9.9.9',
    );
    const unversioned = facts([], [installed('my-dependency@m')]);
    expect(checkDeclaredDependency(constrained, unversioned)?.message).toBe(
      'Requires "my-dependency@m" ~2.1.0, installed (no version)',
    );
  });
});

spec(
  'dependencies.guide.Test a plugin and its dependency locally.Entries that name a marketplace',
  () => {
    const named = entry({ name: 'my-dependency', marketplace: 'shared' });

    test('an entry that names a marketplace also matches the local copy on Claude Code 2.1.242 or later', () => {
      expect(
        checkDeclaredDependency(named, withLocal(local()), {
          hostVersion: '2.1.242',
          namesMarketplace: true,
        }),
      ).toBeUndefined();
      expect(
        checkDeclaredDependency(named, withLocal(local()), {
          hostVersion: '2.1.300',
          namesMarketplace: true,
        }),
      ).toBeUndefined();
      expect(checkDeclaredDependency(named, withLocal(local()))).toBeUndefined();
    });

    test('on an earlier version it does not, and the dependency is reported as not installed', () => {
      expect(
        checkDeclaredDependency(named, withLocal(local()), {
          hostVersion: '2.1.241',
          namesMarketplace: true,
        })?.message,
      ).toBe('Dependency "my-dependency@shared" is not installed');
    });

    describe('the install plan agrees with the load check', () => {
      const plan = (entryItem: unknown, hostVersion?: string) =>
        installClosure(
          {
            root: 'my-plugin@m',
            scope: 'user',
            operation: 'reload-plugins',
            ...(hostVersion === undefined ? {} : { hostVersion }),
          },
          facts(
            [
              plugin('my-plugin', { manifest: [entryItem] }),
              plugin('my-dependency', { marketplace: 'shared', currentCopyVersion: '1.0.0' }),
              plugin('my-dependency', { currentCopyVersion: '1.0.0' }),
            ],
            [],
            { localCopies: [local()], allowlists: { m: ['shared'] } },
          ),
        );

      test('on 2.1.241 the local copy does not meet an entry that names a marketplace, so the dependency is installed', () => {
        const result = plan({ name: 'my-dependency', marketplace: 'shared' }, '2.1.241');
        expect(result.steps.map((one) => [one.id, one.action])).toEqual([
          ['my-dependency@shared', 'install'],
        ]);
      });

      test('on 2.1.242 and later, or with no version given, it does, so nothing is installed', () => {
        for (const version of ['2.1.242', '2.1.300', undefined]) {
          const result = plan({ name: 'my-dependency', marketplace: 'shared' }, version);
          expect(result.steps).toEqual([]);
          expect(result.leftOut).toEqual([]);
        }
      });

      test('an entry that names no marketplace is met by the local copy on 2.1.241 too', () => {
        expect(plan('my-dependency', '2.1.241').steps).toEqual([]);
      });

      test('a refused cross-marketplace entry is reported, not silently met by the local copy, before 2.1.242', () => {
        const refused = installClosure(
          { root: 'my-plugin@m', scope: 'user', operation: 'install', hostVersion: '2.1.241' },
          facts(
            [
              plugin('my-plugin', { entry: [{ name: 'my-dependency', marketplace: 'shared' }] }),
              plugin('my-dependency', { marketplace: 'shared' }),
            ],
            [],
            { localCopies: [local()] },
          ),
        );
        expect(refused.ok).toBe(false);
        expect(refused.issues[0]?.message).toContain('my-dependency@shared');
      });
    });

    test('whether an item names a marketplace is read from the item as written', () => {
      expect(
        [
          'my-dependency',
          'my-dependency@shared',
          { name: 'x' },
          { name: 'x', marketplace: 'shared' },
        ].map(namesMarketplace),
      ).toEqual([false, true, false, true]);
    });

    test('an entry with no marketplace matches the local copy on any version', () => {
      expect(
        checkDeclaredDependency(entry(), withLocal(local()), { hostVersion: '2.1.100' }),
      ).toBeUndefined();
    });

    test('a local copy of another name never matches', () => {
      expect(
        checkDeclaredDependency(named, withLocal({ name: 'other', enabled: true }), {
          hostVersion: '2.1.242',
        }),
      ).toBeDefined();
    });
  },
);

spec(
  'dependencies.guide.Test a plugin and its dependency locally.You disabled the local copy',
  () => {
    test('the plugin is disabled with an error ending `is disabled — enable it or remove the dependency`', () => {
      const found = checkDeclaredDependency(entry(), withLocal(local(false)));
      expect(found?.message.endsWith('is disabled — enable it or remove the dependency')).toBe(
        true,
      );
      expect(found?.errorType).toBe('dependency-unsatisfied');
    });

    test('the error names the dependency as <name>@inline, which refers to the --plugin-dir copy', () => {
      expect(checkDeclaredDependency(entry(), withLocal(local(false)))?.message).toBe(
        'Dependency "my-dependency@inline" is disabled — enable it or remove the dependency',
      );
    });

    test('an installed copy that is disabled is named by its marketplace id, not @inline', () => {
      const have = facts([], [installed('my-dependency@m', { enabled: false })]);
      expect(checkDeclaredDependency(entry(), have)?.message).toBe(
        'Dependency "my-dependency@m" is disabled — enable it or remove the dependency',
      );
    });

    test('enabling the local copy again lets the plugin load', () => {
      expect(checkDeclaredDependency(entry(), withLocal(local(true)))).toBeUndefined();
    });
  },
);

describe('judgments (outside spec)', () => {
  test('an installed copy of the dependency wins over the local one', () => {
    const have = facts([], [installed('my-dependency@m', { version: '1.0.0' })], {
      localCopies: [local(false)],
    });
    expect(checkDeclaredDependency(entry(), have)).toBeUndefined();
  });
});
