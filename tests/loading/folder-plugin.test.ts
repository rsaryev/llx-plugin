/**
 * plugins/loading.md § Find where a plugin came from (`@skills-dir`: "a plugin directory that has a
 * `.claude-plugin/plugin.json` under `~/.claude/skills/` or the project's `.claude/skills/`"; the
 * manifest's `defaultEnabled` unless a settings file sets `<name>@skills-dir`; "for `@inline` and
 * `@skills-dir` it's the `name` in the plugin's manifest"); plugins/manifest-reference.md § Standard
 * layout (the manifest is optional); plugins/create.md § Plugin layout (no manifest: named after the
 * directory), § Name the plugin's skills, § Share the plugin through a repository; skills.md § Skill
 * folder as a plugin. Folders are in-memory `PluginFiles`.
 */
import { describe, expect, test } from 'bun:test';
import { probeFolder, skillsDirPluginEnabled } from '../../src/loading/folder-plugin.ts';
import { memoryFiles } from '../support/ports.ts';
import { json, messagesOf } from '../support/plugin-folder.ts';

const manifest = (extra: Record<string, unknown> = {}) => json({ name: 'my-tool', ...extra });

const probe = (
  files: Parameters<typeof memoryFiles>[0],
  origin: 'skills-dir' | 'inline' = 'skills-dir',
  folderName = 'tool-folder',
) => probeFolder(memoryFiles(files), folderName, origin);

describe('the folder-is-a-plugin probe', () => {
  test('a folder of a skills directory with a manifest is the @skills-dir plugin named by the manifest', async () => {
    const found = await probe({ '.claude-plugin/plugin.json': manifest() });
    expect(found.plugin).toMatchObject({
      name: 'my-tool',
      id: 'my-tool@skills-dir',
      defaultEnabled: true,
    });
    expect(found.plainSkill).toBeUndefined();
  });

  test("the manifest's name wins over the folder's", async () => {
    const found = await probe(
      { '.claude-plugin/plugin.json': manifest({ name: 'renamed' }) },
      'skills-dir',
      'folder',
    );
    expect(found.plugin?.id).toBe('renamed@skills-dir');
  });

  test('defaultEnabled: false is read from the manifest', async () => {
    const found = await probe({
      '.claude-plugin/plugin.json': manifest({ defaultEnabled: false }),
    });
    expect(found.plugin?.defaultEnabled).toBe(false);
  });

  test('a skills-directory folder with only a SKILL.md is a plain skill, not a plugin', async () => {
    const found = await probe({ 'SKILL.md': 'Deploy it.' }, 'skills-dir', 'deploy-staging');
    expect(found.plugin).toBeUndefined();
    expect(found.plainSkill).toEqual({ name: 'deploy-staging' });
  });

  test('a skills-directory folder with components but no manifest is neither', async () => {
    const found = await probe({ 'skills/review/SKILL.md': 'Review.', '.mcp.json': '{}' });
    expect(found).toEqual({ plugin: undefined, plainSkill: undefined, issues: [] });
  });

  test('an empty folder is neither', async () => {
    expect(await probe({})).toEqual({ plugin: undefined, plainSkill: undefined, issues: [] });
  });

  test('the components the folder shows at its root are listed in layout order', async () => {
    const found = await probe({
      '.claude-plugin/plugin.json': manifest(),
      'SKILL.md': 'root',
      'agents/a.md': 'a',
      'hooks/hooks.json': '{}',
      '.mcp.json': '{}',
    });
    expect(found.plugin?.components).toEqual(['agents', 'hooks', 'mcpServers']);
    expect(found.plugin?.rootSkill).toBe(true);
  });

  test('a manifest that does not load is reported, and the folder is no plugin', async () => {
    const broken = await probe({ '.claude-plugin/plugin.json': '{ nope' });
    expect(broken.plugin).toBeUndefined();
    expect(messagesOf(broken.issues)).toEqual([
      expect.stringContaining('.claude-plugin/plugin.json could not be read as JSON'),
    ]);
    const invalid = await probe({ '.claude-plugin/plugin.json': json({ name: 'a b' }) });
    expect(invalid.plugin).toBeUndefined();
    expect(invalid.issues[0]).toMatchObject({ severity: 'error', path: 'name' });
  });
});

describe('a folder handed to --plugin-dir', () => {
  test('with no manifest it is named after its directory; the manifest, when there is one, names it', async () => {
    const bare = await probe({ 'skills/review/SKILL.md': 'Review.' }, 'inline', 'my-plugin');
    expect(bare.plugin).toMatchObject({ name: 'my-plugin', id: 'my-plugin@inline' });
    const named = await probe({ '.claude-plugin/plugin.json': manifest() }, 'inline', 'my-plugin');
    expect(named.plugin?.id).toBe('my-tool@inline');
  });

  test('a folder with neither a manifest nor a component is not a plugin (it may be a folder of plugins)', async () => {
    expect(await probe({ 'notes.txt': 'x' }, 'inline')).toEqual({
      plugin: undefined,
      plainSkill: undefined,
      issues: [],
    });
  });

  test('a directory name that cannot name a plugin is reported', async () => {
    const found = await probe({ '.mcp.json': '{}' }, 'inline', 'my plugin');
    expect(found.plugin).toBeUndefined();
    expect(found.issues[0]).toMatchObject({ severity: 'error', path: 'name' });
  });
});

describe('whether a skills-directory plugin is on', () => {
  test("the manifest's defaultEnabled, unless a settings file sets <name>@skills-dir", () => {
    expect(skillsDirPluginEnabled(true, undefined)).toBe(true);
    expect(skillsDirPluginEnabled(false, undefined)).toBe(false);
    expect(skillsDirPluginEnabled(false, true)).toBe(true);
    expect(skillsDirPluginEnabled(true, false)).toBe(false);
  });
});
