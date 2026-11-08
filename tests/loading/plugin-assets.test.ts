/**
 * plugins/components.md § Themes and output styles (a theme is `themes/<slug>.json` in the custom
 * theme format and appears in `/theme` under the file's `name`, marked as from the plugin; an output
 * style is `output-styles/<name>.md` and appears as `<plugin>:<name>`; the manifest key replaces the
 * folder scan; plugin themes are read-only, an edit is saved as a copy in the user's own themes
 * directory); workflows.md § Distribute a workflow in a plugin (a script in `workflows/`, or where the
 * `workflows` manifest field points; "a plugin called `acme-tools` containing a script whose
 * `meta.name` is `release-audit` runs as `/acme-tools:release-audit`"). What the docs leave open (the
 * name of a copy, a script without a readable meta) is a judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readTheme } from '../../src/format/theme.ts';
import { copyOfPluginTheme } from '../../src/format/theme-write.ts';
import { loadPlugin } from '../../src/index.ts';
import { json } from '../support/plugin-folder.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

type Tree = Record<string, string>;

const load = (tree: Tree, name = 'my-plugin') => {
  const manifest = { '.claude-plugin/plugin.json': json({ name }) };
  return loadPlugin({ files: memoryFiles({ ...manifest, ...tree }) });
};

const DRACULA = json({
  name: 'Dracula',
  base: 'dark',
  overrides: { claude: '#bd93f9', error: '#ff5555' },
});

const AUDIT_ROUTES = `export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler for missing auth checks',
}

const found = await agent('List every .ts file under src/routes/.')
return found
`;

const script = (name: string): string =>
  `export const meta = { name: '${name}', description: 'd' }\nreturn []\n`;

spec('themes.components.Themes and output styles', () => {
  test('the docs theme: themes/dracula.json appears under its name, marked as from my-plugin', async () => {
    const { plugin, issues } = await load({ 'themes/dracula.json': DRACULA });
    expect(issues).toEqual([]);
    const [dracula] = plugin?.themes ?? [];
    expect(dracula?.path).toBe('themes/dracula.json');
    expect(dracula?.plugin).toBe('my-plugin');
    expect(dracula?.theme?.name).toBe('Dracula');
    expect(dracula?.theme?.base).toBe('dark');
    expect(Object.keys(dracula?.theme?.overrides ?? {})).toEqual(['claude', 'error']);
  });

  test('it is the custom theme format: without a name the slug is the label, as in ~/.claude/themes', async () => {
    const { plugin } = await load({ 'themes/night.json': json({ base: 'light' }) });
    expect(plugin?.themes[0]?.theme?.name).toBe('night');
    expect(plugin?.themes[0]?.theme).toEqual(readTheme('night', json({ base: 'light' })).theme);
  });

  test('an invalid colour and an unknown token are dropped, as in a user theme; the plugin still loads', async () => {
    const body = json({ overrides: { error: 'nope', claud: '#fff', text: '#000' } });
    const { plugin, issues } = await load({ 'themes/t.json': body });
    expect(Object.keys(plugin?.themes[0]?.theme?.overrides ?? {})).toEqual(['text']);
    expect(issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'themes/t.json'],
    ]);
  });

  test('a theme file that is not a JSON object is reported at its path and has no theme', async () => {
    const { plugin, issues } = await load({ 'themes/bad.json': '[1]' });
    expect(plugin?.themes[0]?.theme).toBeUndefined();
    expect(issues.map((found) => found.path)).toEqual(['themes/bad.json']);
  });

  test('setting the manifest key replaces the folder scan: experimental.themes for a theme', async () => {
    const files = {
      '.claude-plugin/plugin.json': json({
        name: 'my-plugin',
        experimental: { themes: './looks/' },
      }),
      'themes/a.json': DRACULA,
      'looks/b.json': json({ name: 'B' }),
    };
    const { plugin, issues } = await loadPlugin({ files: memoryFiles(files) });
    expect(plugin?.themes.map((one) => one.path)).toEqual(['looks/b.json']);
    expect(issues.map((found) => found.message)).toEqual([
      'Default themes/ folder is ignored because the manifest sets "experimental.themes"',
    ]);
  });

  test('setting outputStyles replaces the scan of output-styles/ the same way', async () => {
    const files = {
      '.claude-plugin/plugin.json': json({ name: 'my-plugin', outputStyles: './styles/' }),
      'output-styles/a.md': 'A',
      'styles/loud.md': 'Loud',
    };
    const { plugin } = await loadPlugin({ files: memoryFiles(files) });
    expect(plugin?.outputStyles.map((one) => one.qualifiedName)).toEqual(['my-plugin:loud']);
  });

  test('an output style appears as <plugin>:<name>', async () => {
    const { plugin } = await load({ 'output-styles/terse.md': 'Be terse.' });
    expect(plugin?.outputStyles.map((one) => one.qualifiedName)).toEqual(['my-plugin:terse']);
  });

  test("plugin themes are read-only: an edit is a copy in the user's own themes directory", () => {
    const plugin = readTheme('dracula', DRACULA).theme;
    if (plugin === undefined) throw new Error('the docs theme reads');
    const edited = {
      ...plugin,
      overrides: { ...plugin.overrides, text: { form: 'ansi', name: 'white' } },
    } as const;
    const copy = copyOfPluginTheme(edited, new Set());
    expect(copy.slug).toBe('dracula');
    expect(readTheme(copy.slug, copy.text).theme).toEqual(edited);
    expect(JSON.parse(copy.text)).toEqual({
      name: 'Dracula',
      base: 'dark',
      overrides: { claude: '#bd93f9', error: '#ff5555', text: 'ansi:white' },
    });
  });
});

spec('workflows.behavior.Distribute a workflow in a plugin', () => {
  test('a script in workflows/ at the plugin root runs as /<plugin>:<meta.name> (the docs example)', async () => {
    const { plugin, issues } = await load({ 'workflows/audit-routes.js': AUDIT_ROUTES });
    expect(issues).toEqual([]);
    expect(plugin?.workflows.map((one) => one.qualifiedName)).toEqual(['my-plugin:audit-routes']);
    expect(plugin?.workflows[0]?.meta?.description).toBe(
      'Audit every route handler for missing auth checks',
    );
  });

  test('the namespace is the plugin name and the name is meta.name, not the file name', async () => {
    const { plugin } = await load({ 'workflows/audit.js': script('release-audit') }, 'acme-tools');
    expect(plugin?.workflows[0]?.name).toBe('audit');
    expect(plugin?.workflows[0]?.qualifiedName).toBe('acme-tools:release-audit');
  });

  test('the workflows manifest field points to a different location, and the default folder is not scanned', async () => {
    const files = {
      '.claude-plugin/plugin.json': json({ name: 'acme-tools', workflows: './flows/' }),
      'workflows/old.js': script('old'),
      'flows/release-audit.js': script('release-audit'),
    };
    const { plugin } = await loadPlugin({ files: memoryFiles(files) });
    expect(plugin?.workflows.map((one) => one.qualifiedName)).toEqual(['acme-tools:release-audit']);
  });
});

describe('plugin workflows (judgments)', () => {
  test('a script without a readable meta stays in the plugin with no name to run under, and one issue says why', async () => {
    const tree = { 'workflows/a.js': 'export default {}', 'workflows/b.js': script('b') };
    const { plugin, issues } = await load(tree);
    expect(plugin?.workflows.map((one) => one.qualifiedName)).toEqual([undefined, 'my-plugin:b']);
    expect(issues.map((found) => found.path)).toEqual(['workflows/a.js']);
  });

  test('a workflow with import() is reported at its path and still listed', async () => {
    const body = `${script('x')}const fs = await import('node:fs')\n`;
    const { plugin, issues } = await load({ 'workflows/x.js': body });
    expect(plugin?.workflows).toHaveLength(1);
    expect(issues.map((found) => found.path)).toEqual(['workflows/x.js']);
    expect(issues[0]?.message).toContain('import()');
  });

  test('the copy of a plugin theme does not overwrite a theme the user already has', () => {
    const theme = readTheme('dracula', DRACULA).theme;
    if (theme === undefined) throw new Error('the docs theme reads');
    expect(copyOfPluginTheme(theme, new Set(['dracula'])).slug).toBe('dracula-copy');
    expect(copyOfPluginTheme(theme, new Set(['dracula', 'dracula-copy'])).slug).toBe(
      'dracula-copy-2',
    );
    expect(copyOfPluginTheme(theme, new Set(['other'])).slug).toBe('dracula');
  });
});
