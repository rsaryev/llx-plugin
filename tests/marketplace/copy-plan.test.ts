/**
 * plugins/host-marketplace.md § Share files within a marketplace with symlinks ("When Claude Code
 * copies the plugin into its cache, it handles each symlink by where the target resolves");
 * plugins/marketplace-reference.md § Output that fails the install or update (Too large to copy).
 * A plan over real paths a host resolved. (plugins/loading.md § Paths that escape the plugin
 * directory is proven through the loader in tests/loading/path-escape.test.ts.)
 */
import { describe, expect, test } from 'bun:test';
import { planTreeCopy, pluginRootIssue, type TreeEntry } from '../../src/marketplace/copy-plan.ts';
import { relativeFrom } from '../../src/format/link-rule.ts';
import { spec } from '../support/spec.ts';

const PLUGIN = '/m/plugins/meta';
const roots = { pluginRoot: PLUGIN, marketplaceRoot: '/m' };

const file = (path: string, bytes = 1): TreeEntry => ({
  path,
  isDirectory: false,
  isSymlink: false,
  bytes,
});
const dir = (path: string): TreeEntry => ({ path, isDirectory: true, isSymlink: false, bytes: 0 });
const link = (path: string, target?: string, isDirectory = true): TreeEntry => ({
  path,
  isDirectory: false,
  isSymlink: true,
  bytes: 0,
  ...(target === undefined ? {} : { target: { path: target, isDirectory } }),
});

const SHARE = 'marketplace.hosting.Share files within a marketplace with symlinks';

spec(`${SHARE}.Within the plugin's own directory`, () => {
  test('the symlink is preserved as a relative symlink, so it keeps resolving to the copied target', () => {
    const plan = planTreeCopy(
      [dir('shared'), file('shared/a.md'), link('skills/own', `${PLUGIN}/shared`)],
      roots,
    );
    expect(plan.relinks).toEqual([{ path: 'skills/own', target: '../shared' }]);
    expect(plan.dereferences).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  test('a link to a file in a folder below the link, and one to the folder above it', () => {
    const plan = planTreeCopy(
      [
        link('l', `${PLUGIN}/a/b/f.md`, false),
        link('a/b/up', `${PLUGIN}/a`),
        link('a/b/self', `${PLUGIN}/a/b`),
      ],
      roots,
    );
    expect(plan.relinks).toEqual([
      { path: 'l', target: 'a/b/f.md' },
      { path: 'a/b/up', target: '..' },
      { path: 'a/b/self', target: '.' },
    ]);
  });
});

spec(`${SHARE}.Elsewhere within the same marketplace`, () => {
  test('the symlink is dereferenced: the target content is copied into the cache in its place', () => {
    const plan = planTreeCopy([link('skills/foo', '/m/plugins/shared-plugin/skills/foo')], roots);
    expect(plan.dereferences).toEqual([
      { path: 'skills/foo', from: '/m/plugins/shared-plugin/skills/foo', isDirectory: true },
    ]);
    expect(plan.relinks).toEqual([]);
    expect(plan.copy).toEqual([]);
  });

  test('a link to one file elsewhere in the marketplace is dereferenced as a file', () => {
    const plan = planTreeCopy([link('LICENSE', '/m/LICENSE', false)], roots);
    expect(plan.dereferences).toEqual([
      { path: 'LICENSE', from: '/m/LICENSE', isDirectory: false },
    ]);
  });

  test('a path that merely starts like the plugin directory is elsewhere, not within it', () => {
    const plan = planTreeCopy([link('x', `${PLUGIN}-two/skills`)], roots);
    expect(plan.dereferences).toHaveLength(1);
    expect(plan.relinks).toEqual([]);
  });
});

spec(`${SHARE}.Outside the marketplace`, () => {
  test('the symlink is skipped for security', () => {
    const plan = planTreeCopy(
      [link('a', '/etc/passwd', false), link('b', '/home/user/shared'), link('c', '/m-other/x')],
      roots,
    );
    expect(plan.skipped.map((one) => one.path)).toEqual(['a', 'b', 'c']);
    expect(plan.skipped.every((one) => one.reason === 'outside-marketplace')).toBe(true);
    expect(plan.copy).toEqual([]);
    expect(plan.dereferences).toEqual([]);
  });
});

describe('a plugin installed from a local path or a command in copy mode', () => {
  test('only a symlink within the plugin directory is preserved; all others are skipped', () => {
    const plan = planTreeCopy(
      [
        link('own', `${PLUGIN}/shared`),
        link('sibling', '/m/plugins/shared-plugin/skills'),
        link('away', '/etc'),
      ],
      { pluginRoot: PLUGIN },
    );
    expect(plan.relinks).toEqual([{ path: 'own', target: 'shared' }]);
    expect(plan.dereferences).toEqual([]);
    expect(plan.skipped.map((one) => one.path)).toEqual(['sibling', 'away']);
  });
});

describe('judgments: the copy plan', () => {
  test('files and directories are copied as they are, in order', () => {
    const plan = planTreeCopy([dir('skills'), file('skills/a.md'), file('x')], roots);
    expect(plan.copy).toEqual(['skills', 'skills/a.md', 'x']);
  });

  test('a link whose target does not exist is skipped', () => {
    expect(planTreeCopy([link('dangling')], roots).skipped).toEqual([
      { path: 'dangling', reason: 'dangling' },
    ]);
  });

  test.each([
    ['the marketplace root', '/m'],
    ["the plugin's own parent", '/m/plugins'],
  ])(
    'a link to %s would copy the plugin into itself without end, so it is skipped as a cycle',
    (_, target) => {
      const plan = planTreeCopy([link('everything', target), file('a.md')], roots);
      expect(plan.skipped).toEqual([{ path: 'everything', reason: 'cycle' }]);
      expect(plan.dereferences).toEqual([]);
      expect(plan.copy).toEqual(['a.md']);
    },
  );

  test('a link in a dereferenced directory back to the directory it came from ends there', () => {
    const shared = '/m/plugins/shared-plugin';
    const first = planTreeCopy([link('skills', `${shared}/skills`)], roots);
    expect(first.dereferences.map((one) => one.from)).toEqual([`${shared}/skills`]);
    // the host plans the dereferenced directory again, below the link, remembering where it is
    const again = planTreeCopy(
      [
        link('skills/back', `${shared}/skills`),
        link('skills/up', shared),
        link('skills/home', PLUGIN),
      ],
      { ...roots, copying: [`${shared}/skills`] },
    );
    expect(again.skipped.map((one) => [one.path, one.reason])).toEqual([
      ['skills/back', 'cycle'],
      ['skills/up', 'cycle'],
    ]);
    // a link back to the plugin itself stays a relative link, which copies nothing
    expect(again.relinks.map((one) => one.path)).toEqual(['skills/home']);
    expect(again.dereferences).toEqual([]);
  });

  test('two links to one shared directory are not a cycle: both are dereferenced', () => {
    const plan = planTreeCopy(
      [link('a', '/m/plugins/shared-plugin/skills'), link('b', '/m/plugins/shared-plugin/skills')],
      roots,
    );
    expect(plan.dereferences).toHaveLength(2);
    expect(plan.skipped).toEqual([]);
  });

  test('a link to a file that lies in a directory being copied is not a cycle', () => {
    const plan = planTreeCopy([link('l', '/m/LICENSE', false)], roots);
    expect(plan.skipped).toEqual([]);
  });

  test('a plugin directory that leaves its marketplace is refused with the listing line', () => {
    const refused = pluginRootIssue({
      entryPath: './my-plugin',
      pluginRoot: '/elsewhere/my-plugin',
      marketplaceRoot: '/m',
    });
    expect(refused?.message).toBe(
      'Plugin source path refused: ./my-plugin does not stay inside its marketplace directory. Check that the marketplace entry has a plain relative path.',
    );
    expect(
      pluginRootIssue({ entryPath: './p', pluginRoot: '/m/p', marketplaceRoot: '/m' }),
    ).toBeUndefined();
  });

  test('relativeFrom walks up out of the directories the link is in', () => {
    expect(relativeFrom('a/b/c', 'a/x')).toBe('../../x');
    expect(relativeFrom('', 'x/y')).toBe('x/y');
    expect(relativeFrom('a', 'a/b')).toBe('b');
  });
});

describe('limits: a tree copied whole (a command source in copy mode)', () => {
  const limits = { maxBytes: 100, maxEntries: 3 };

  test('more entries than the limit is too many to copy', () => {
    const plan = planTreeCopy([file('a'), file('b'), file('c'), file('d')], roots, limits);
    expect(plan.refusals.map((one) => one.message)).toEqual([
      'The printed directory has more than 3 entries, too many to copy',
    ]);
    expect(planTreeCopy([file('a'), file('b'), file('c')], roots, limits).refusals).toEqual([]);
  });

  test('more bytes than the limit is too large to copy', () => {
    const plan = planTreeCopy([file('a', 60), file('b', 41)], roots, limits);
    expect(plan.refusals.map((one) => one.message)).toEqual([
      'The printed directory is larger than 100 bytes, too large to copy',
    ]);
    expect(
      planTreeCopy([file('a', 256 * 1024 * 1024 + 1)], roots, {
        maxBytes: 256 * 1024 * 1024,
        maxEntries: 9,
      }).refusals[0]?.message,
    ).toBe('The printed directory is larger than 256 MiB, too large to copy');
    expect(planTreeCopy([file('a', 60), file('b', 40)], roots, limits).refusals).toEqual([]);
  });

  test('without limits nothing is refused for size', () => {
    expect(planTreeCopy([file('a', 10 ** 12)], roots).refusals).toEqual([]);
  });
});
