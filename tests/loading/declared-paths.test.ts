/**
 * plugins/manifest-reference.md § Path-only fields ("`agents` entries must be `.md` files, and `skills`
 * entries must be directories. The other three accept a directory or a file"), § `hooks` ("merges
 * whatever you declare with `hooks/hooks.json` when that file exists"); errors.md § Path escapes plugin
 * directory (the files reported under a component name: `hooks/hooks.json`, `monitors/monitors.json`,
 * `settings.json`, a root `SKILL.md`).
 *
 * Each test places files in an in-memory folder and asserts what discovery or `loadPlugin` finds and
 * reports.
 */
import { describe, expect, test } from 'bun:test';
import { discoverComponents, loadPlugin } from '../../src/index.ts';
import { memoryFiles } from '../support/ports.ts';
import { hooksFile, json, manifestOf, messagesOf, pathsOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

type Tree = Record<string, string | { symlink: string }>;

const discover = (tree: Tree, manifest?: Record<string, unknown>) =>
  discoverComponents(
    memoryFiles(tree),
    manifest ? manifestOf({ name: 'my-plugin', ...manifest }) : undefined,
    'my-plugin',
  );

spec('manifest.field.skills', () => {
  test('a skills entry that is a file is an error and loads nothing; the directory beside it loads', async () => {
    const found = await discover(
      { 'x.md': 'Not a directory.', 'more/lint/SKILL.md': 'L.' },
      { skills: ['./x.md', './more/'] },
    );
    expect(pathsOf(found.skills)).toEqual(['more/lint/SKILL.md']);
    expect(found.issues).toEqual([
      { severity: 'error', path: 'skills', message: 'skills entries must be directories: ./x.md' },
    ]);
  });
});

spec('manifest.field.agents', () => {
  test('an agents entry that is a directory is an error and is not scanned; a .md file beside it loads', async () => {
    const found = await discover(
      { 'dir.md/inner.md': 'Inside.', 'custom/tester.md': 'T.' },
      { agents: ['./dir.md', './custom/tester.md'] },
    );
    expect(pathsOf(found.agents)).toEqual(['custom/tester.md']);
    expect(found.issues).toEqual([
      { severity: 'error', path: 'agents', message: 'agents entries must be .md files: ./dir.md' },
    ]);
  });

  test('the default agents/ folder is still scanned when the key is not set', async () => {
    const found = await discover({ 'agents/a.md': 'A.' });
    expect(pathsOf(found.agents)).toEqual(['agents/a.md']);
    expect(found.issues).toEqual([]);
  });
});

spec('manifest.field.workflows', () => {
  test('a workflows entry may be one file: it is taken as given and the default workflows/ is not scanned', async () => {
    const found = await discover(
      { 'workflows/a.js': '1', 'flows/b.js': '2', 'flows/c.js': '3' },
      { workflows: './flows/b.js' },
    );
    expect(pathsOf(found.workflows)).toEqual(['flows/b.js']);
    expect(messagesOf(found.issues)).toEqual([
      'Default workflows/ folder is ignored because the manifest sets "workflows"',
    ]);
  });
});

spec('manifest.field.experimental.themes', () => {
  test('an experimental.themes entry may be one file: it is taken as given and the default themes/ is not scanned', async () => {
    const found = await discover(
      { 'themes/a.json': '{}', 'looks/b.json': '{}', 'looks/c.json': '{}' },
      { experimental: { themes: './looks/b.json' } },
    );
    expect(pathsOf(found.themes)).toEqual(['looks/b.json']);
    expect(messagesOf(found.issues)).toEqual([
      'Default themes/ folder is ignored because the manifest sets "experimental.themes"',
    ]);
  });
});

const escapes = (component: string, path: string, target: string) =>
  `${component} path escapes plugin directory: ${path} — it resolves to ${target}, outside the plugin directory`;

const groups = async (manifest: unknown) => {
  const { plugin, issues } = await loadPlugin({
    files: memoryFiles({
      '.claude-plugin/plugin.json': json(manifest),
      'hooks/hooks.json': hooksFile('default.sh'),
      'extra.json': hooksFile('extra.sh'),
    }),
  });
  return {
    issues,
    commands: (plugin?.hooks.PostToolUse ?? []).flatMap((group) =>
      group.hooks.map((hook) => ('command' in hook ? hook.command : '')),
    ),
  };
};

describe('a default file that leads outside the plugin (errors.md, "Path escapes plugin directory")', () => {
  test('monitors/monitors.json is reported under monitors and is not a source', async () => {
    const found = await discover({ 'monitors/monitors.json': { symlink: '/etc/monitors.json' } });
    expect(found.monitors).toEqual([]);
    expect(found.issues).toEqual([
      {
        severity: 'error',
        path: 'monitors',
        message: escapes('monitors', 'monitors/monitors.json', '/etc/monitors.json'),
      },
    ]);
  });

  test('settings.json is reported under settings and is not read', async () => {
    const found = await discover({ 'settings.json': { symlink: '../shared/settings.json' } });
    expect(found.settingsFile).toBeUndefined();
    expect(found.issues).toEqual([
      {
        severity: 'error',
        path: 'settings',
        message: escapes('settings', 'settings.json', '../shared/settings.json'),
      },
    ]);
  });

  test('a SKILL.md at the plugin root is reported under skills and is not a skill', async () => {
    const found = await discover({ 'SKILL.md': { symlink: '/etc/SKILL.md' } });
    expect(found.skills).toEqual([]);
    expect(found.issues).toEqual([
      {
        severity: 'error',
        path: 'skills',
        message: escapes('skills', 'SKILL.md', '/etc/SKILL.md'),
      },
    ]);
  });
});

describe('a manifest hooks path that names the default file (judgment)', () => {
  test('loads the file once, so its hooks do not run twice', async () => {
    const loaded = await groups({ name: 'p', hooks: './hooks/hooks.json' });
    expect(loaded.commands).toEqual(['default.sh']);
    expect(loaded.issues).toEqual([]);
  });

  test('among other declared sources the default stays first and is not repeated', async () => {
    const loaded = await groups({ name: 'p', hooks: ['./extra.json', './hooks/hooks.json'] });
    expect(loaded.commands).toEqual(['default.sh', 'extra.sh']);
  });

  test('two declared spellings of one file load it once', async () => {
    const loaded = await groups({ name: 'p', hooks: ['./extra.json', './extra.json'] });
    expect(loaded.commands).toEqual(['default.sh', 'extra.sh']);
  });
});
