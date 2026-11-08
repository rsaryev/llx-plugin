/**
 * errors.md § Path escapes plugin directory: "A message that gives the full path of one of a
 * marketplace plugin's own files, such as `hooks/hooks.json`, means Claude Code skipped that file";
 * the component name is `hooks` for `hooks/hooks.json`, `monitors` for `monitors/monitors.json`,
 * `settings` for `settings.json` and `skills` for a `SKILL.md` at the plugin root; for a plugin in a
 * local marketplace the file must be inside that marketplace too. The same sentence reads
 * `commands path escapes plugin directory: <path>` for a declared path.
 */
import { expect, test } from 'bun:test';
import { loadPlugin } from '../../src/index.ts';
import { json, messagesOf } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const PLUGIN = '/home/user/my-marketplace/my-plugin';
const roots = { pluginRoot: PLUGIN, marketplaceRoot: '/home/user/my-marketplace' };
const OUT = '/home/user/dotfiles/x';

const issuesOf = async (own: string, extra: Record<string, string> = {}) => {
  const files = memoryFiles({
    '.claude-plugin/plugin.json': json({ name: 'my-plugin' }),
    [own]: { symlink: OUT },
    ...extra,
  });
  return messagesOf((await loadPlugin({ files, roots })).issues);
};

const message = (component: string, file: string) =>
  `${component} path escapes plugin directory: ${PLUGIN}/${file} — it resolves to ${OUT}, outside the plugin directory and its marketplace directory`;

spec('cli.errors.Path escapes plugin directory', () => {
  test('a declared path reads `<field> path escapes plugin directory: <path>`', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': json({ name: 'p', commands: ['./commands\\deploy.md'] }),
    });
    expect(messagesOf((await loadPlugin({ files })).issues)).toContain(
      'commands path escapes plugin directory: ./commands\\deploy.md',
    );
  });
});

spec('cli.errors.Path escapes plugin directory.hooks/hooks.json', () => {
  test('is reported by its full path under `hooks`', async () => {
    expect(await issuesOf('hooks/hooks.json')).toContain(message('hooks', 'hooks/hooks.json'));
  });
});

spec('cli.errors.Path escapes plugin directory.monitors/monitors.json', () => {
  test('is reported by its full path under `monitors`', async () => {
    expect(await issuesOf('monitors/monitors.json')).toContain(
      message('monitors', 'monitors/monitors.json'),
    );
  });
});

spec('cli.errors.Path escapes plugin directory.settings.json', () => {
  test('is reported by its full path under `settings`', async () => {
    expect(await issuesOf('settings.json')).toContain(message('settings', 'settings.json'));
  });
});

spec('cli.errors.Path escapes plugin directory.SKILL.md', () => {
  test('a SKILL.md at the plugin root is reported under `skills`', async () => {
    expect(await issuesOf('SKILL.md')).toContain(message('skills', 'SKILL.md'));
  });
});
