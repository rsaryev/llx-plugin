/**
 * plugins/loading.md § Paths that escape the plugin directory: "Whether a plugin loads in place or
 * from a cached copy, Claude Code doesn't let it declare components outside its own directory".
 * Rejected: a path that points outside as written, a symlink that leads outside the plugin "other
 * than links between plugins within one marketplace", and on macOS and Linux a path with a
 * backslash; the plugin "loads without that component". Proven through `locate`, the one place the
 * loader decides it, and through `loadPlugin` with such a path declared.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { locate, type LocateContext } from '../../src/format/locate.ts';
import { memoryFiles } from '../support/ports.ts';
import { json, messagesOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

type Tree = Record<string, string | { symlink: string }>;

const PLUGIN = '/m/plugins/meta';
const base = { pluginRoot: PLUGIN, marketplaceRoot: '/m' };

const where = (
  written: string,
  tree: Tree = {},
  rest: Partial<Omit<LocateContext, 'files'>> = {},
) =>
  locate({ files: memoryFiles(tree), platform: 'posix', ...rest }, 'commands', written).then(
    (found) => found.issue,
  );

const FILE = 'commands/deploy.md';

spec('install.loading.Paths that escape the plugin directory', () => {
  test('a path that points outside the plugin as written is rejected, whether declared in plugin.json or in an entry', async () => {
    expect((await where('./../shared.md'))?.message).toBe(
      'commands path escapes plugin directory: ./../shared.md',
    );
    expect((await where('../shared-utils'))?.severity).toBe('error');
    expect((await where('/etc/commands.md'))?.message).toContain('path escapes plugin directory');
  });

  test('a path spelled with empty or `.` segments stays inside: the port is never handed an absolute path', async () => {
    const files = memoryFiles({ [FILE]: 'x' });
    const found = await locate({ files, platform: 'posix' }, 'commands', './/commands/./deploy.md');
    expect(found.stat?.isFile).toBe(true);
    expect(files.accesses.map(({ path }) => path)).toEqual([FILE]);
  });

  test('a symlink that leads outside the plugin is rejected, and the message says where it resolves', async () => {
    const tree = { [FILE]: { symlink: '/home/user/shared/deploy.md' } };
    expect((await where(`./${FILE}`, tree, { roots: base }))?.message).toBe(
      'commands path escapes plugin directory: ./commands/deploy.md — it resolves to /home/user/shared/deploy.md, outside the plugin directory',
    );
  });

  test('a link to another plugin within the same marketplace is not rejected', async () => {
    const tree = { 'skills/foo': { symlink: '/m/plugins/shared-plugin/skills/foo' } };
    expect(await where('./skills/foo', tree, { roots: base })).toBeUndefined();
    // a relative target that climbs into the marketplace is judged by where it ends
    const climbing = { 'skills/foo': { symlink: '../../shared-plugin/skills/foo' } };
    expect(await where('./skills/foo', climbing, { roots: base })).toBeUndefined();
  });

  test('without a marketplace, a link to a sibling directory is outside the plugin', async () => {
    const tree = { 'skills/foo': { symlink: '/m/plugins/shared-plugin/skills/foo' } };
    const issue = await where('./skills/foo', tree, { roots: { pluginRoot: PLUGIN } });
    expect(issue?.path).toBe('commands');
    const unknown = await where('./skills/foo', { 'skills/foo': { symlink: '../shared/foo' } });
    expect(unknown?.message).toContain('resolves to ../shared/foo');
  });

  test('on macOS and Linux a path that contains a backslash anywhere is rejected, even when it stays inside', async () => {
    for (const written of [
      './commands\\deploy.md',
      '.\\commands/deploy.md',
      './commands/de\\ploy.md',
    ]) {
      expect((await where(written, { 'commands/deploy.md': 'x' }))?.message).toBe(
        `commands path escapes plugin directory: ${written}`,
      );
    }
  });

  test('on Windows a backslash is a separator, so a path with forward or back slashes that stays inside loads', async () => {
    const tree = { 'commands/deploy.md': 'x' };
    for (const written of ['./commands/deploy.md', './commands\\deploy.md']) {
      expect(await where(written, tree, { platform: 'windows' })).toBeUndefined();
    }
    expect((await where('.\\..\\shared.md', tree, { platform: 'windows' }))?.severity).toBe(
      'error',
    );
  });

  test('a path inside the plugin, a link within it and a plain relative path are fine', async () => {
    expect(await where('./commands/deploy.md', { 'commands/deploy.md': 'x' })).toBeUndefined();
    const tree = { 'commands/link.md': { symlink: `${PLUGIN}/shared/deploy.md` } };
    expect(await where('./commands/link.md', tree, { roots: base })).toBeUndefined();
    const relative = { 'commands/link.md': { symlink: '../shared/deploy.md' } };
    expect(await where('./commands/link.md', relative, { roots: base })).toBeUndefined();
  });

  test('a plugin that declares a command with a backslash path loads without that command', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': json({ name: 'p', commands: ['./commands\\deploy.md'] }),
      'commands/deploy.md': 'Deploy.',
    });
    const loaded = await loadPlugin({ files });
    expect(loaded.plugin?.commands).toEqual([]);
    expect(messagesOf(loaded.issues)).toContain(
      'commands path escapes plugin directory: ./commands\\deploy.md',
    );
    const onWindows = await loadPlugin({ files, platform: 'windows' });
    expect(messagesOf(onWindows.issues)).not.toContain(
      'commands path escapes plugin directory: ./commands\\deploy.md',
    );
  });
});

describe('judgments: component paths', () => {
  test('a drive-letter path is absolute, on Windows too', async () => {
    expect((await where('C:\\x\\y.md', {}, { platform: 'windows' }))?.severity).toBe('error');
    expect((await where('C:/x/y.md'))?.severity).toBe('error');
  });
});
