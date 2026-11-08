/**
 * plugins/host-marketplace.md § Share files within a marketplace with symlinks ("When Claude Code
 * copies the plugin into its cache, it handles each symlink by where the target resolves"); plugins/
 * loading.md § Paths that escape the plugin directory; plugins/marketplace-reference.md § Output
 * that fails the install or update (Too large to copy). A plan over real paths a host resolved.
 */
import { describe, expect, test } from 'bun:test';
import { planTreeCopy, pluginRootIssue, type TreeEntry } from '../../src/marketplace/copy-plan.ts';
import { relativeFrom } from '../../src/marketplace/link-rule.ts';
import { escapedPathIssue } from '../../src/marketplace/path-escape.ts';
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

describe('judgments: component paths', () => {
  test('a drive-letter path is absolute, on Windows too', () => {
    expect(COMPONENT('C:\\x\\y.md', { platform: 'windows' })?.severity).toBe('error');
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
    expect(plan.refusals[0]?.message).toContain('too large to copy');
    expect(planTreeCopy([file('a', 60), file('b', 40)], roots, limits).refusals).toEqual([]);
  });

  test('without limits nothing is refused for size', () => {
    expect(planTreeCopy([file('a', 10 ** 12)], roots).refusals).toEqual([]);
  });
});

const COMPONENT = (written: string, rest: Record<string, unknown> = {}) =>
  escapedPathIssue({
    component: 'commands',
    written,
    platform: 'posix',
    pluginRoot: PLUGIN,
    marketplaceRoot: '/m',
    ...rest,
  });

spec('install.loading.Paths that escape the plugin directory', () => {
  test('a path that points outside the plugin as written is rejected, whether declared in plugin.json or in an entry', () => {
    expect(COMPONENT('./../shared.md')?.message).toBe(
      'commands path escapes plugin directory: ./../shared.md',
    );
    expect(COMPONENT('../shared-utils')?.severity).toBe('error');
    expect(COMPONENT('/etc/commands.md')?.message).toContain('path escapes plugin directory');
  });

  test('a symlink that leads outside the plugin is rejected, and the message says where it resolves', () => {
    expect(
      COMPONENT('./commands/deploy.md', { resolvesTo: '/home/user/shared/deploy.md' })?.message,
    ).toBe(
      'commands path escapes plugin directory: ./commands/deploy.md — it resolves to /home/user/shared/deploy.md, outside the plugin directory',
    );
  });

  test('a link to another plugin within the same marketplace is not rejected', () => {
    expect(
      COMPONENT('./skills/foo', { resolvesTo: '/m/plugins/shared-plugin/skills/foo' }),
    ).toBeUndefined();
  });

  test('without a marketplace, a link to a sibling directory is outside the plugin', () => {
    const issue = escapedPathIssue({
      component: 'skills',
      written: './skills/foo',
      platform: 'posix',
      pluginRoot: PLUGIN,
      resolvesTo: '/m/plugins/shared-plugin/skills/foo',
    });
    expect(issue?.path).toBe('skills');
  });

  test('on macOS and Linux a path that contains a backslash anywhere is rejected, even when it stays inside', () => {
    for (const written of [
      './commands\\deploy.md',
      '.\\commands/deploy.md',
      './commands/de\\ploy.md',
    ]) {
      expect(COMPONENT(written)?.message).toBe(
        `commands path escapes plugin directory: ${written}`,
      );
    }
  });

  test('on Windows a backslash is a separator, so a path with forward or back slashes that stays inside loads', () => {
    for (const written of ['./commands/deploy.md', './commands\\deploy.md']) {
      expect(COMPONENT(written, { platform: 'windows' })).toBeUndefined();
    }
    expect(COMPONENT('.\\..\\shared.md', { platform: 'windows' })?.severity).toBe('error');
  });

  test('a path inside the plugin, a link within it and a plain relative path are fine', () => {
    expect(COMPONENT('./commands/deploy.md')).toBeUndefined();
    expect(
      COMPONENT('./commands/link.md', { resolvesTo: `${PLUGIN}/shared/deploy.md` }),
    ).toBeUndefined();
  });
});
