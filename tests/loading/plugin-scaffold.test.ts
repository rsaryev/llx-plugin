/**
 * plugins/create.md § Scaffold the plugin with `claude plugin init` ("creates `~/.claude/skills/my-tool/`
 * with a `.claude-plugin/plugin.json` and a root `SKILL.md`"; the two lines it prints; `--with skills`),
 * § Name the plugin's skills (`/my-tool`, not `/my-tool:my-tool`; `/my-tool:example`), § Share the plugin
 * through a repository (the same layout at `<project>/.claude/skills/<name>/`, loaded under the
 * conditions of plugins/loading.md § Plugins shared through a repository). The plan is written into an
 * in-memory folder and read back with the real probe and `loadPlugin`.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import { probeFolder, skillsDirCommands } from '../../src/loading/folder-plugin.ts';
import { planPluginScaffold, type ScaffoldInput } from '../../src/loading/plugin-scaffold.ts';
import { decideRepositoryPlugin } from '../../src/loading/repository-trust.ts';
import { memoryFiles } from '../support/ports.ts';
import { messagesOf } from '../support/plugin-folder.ts';
import { spec } from '../support/spec.ts';

const planOf = (input: ScaffoldInput) => {
  const result = planPluginScaffold(input);
  if (!('plan' in result)) throw new Error(`no plan: ${JSON.stringify(result.issues)}`);
  return result.plan;
};

const written = (input: ScaffoldInput) =>
  memoryFiles(Object.fromEntries(planOf(input).files.map((file) => [file.path, file.content])));

spec('install.develop.Scaffold the plugin with claude plugin init', () => {
  test('writes a manifest and a root SKILL.md under ~/.claude/skills/<name>/', () => {
    const plan = planOf({ name: 'my-tool', scope: 'user' });
    expect(plan.directory).toBe('~/.claude/skills/my-tool');
    expect(plan.files.map((file) => file.path)).toEqual(['.claude-plugin/plugin.json', 'SKILL.md']);
    expect(JSON.parse(plan.files[0]?.content ?? '')).toEqual({ name: 'my-tool' });
  });

  test('prints the two lines the docs quote', () => {
    const plan = planOf({ name: 'my-tool', scope: 'user' });
    expect(plan.created).toBe('✔ Created plugin "my-tool" at ~/.claude/skills/my-tool');
    expect(plan.loadsAs).toBe(
      'It will auto-load next session as my-tool@skills-dir. Run /reload-plugins to load it now.',
    );
  });

  test('--with skills also scaffolds a skill under skills/', () => {
    const plan = planOf({ name: 'my-tool', scope: 'user', withSkills: true });
    expect(plan.files.map((file) => file.path)).toEqual([
      '.claude-plugin/plugin.json',
      'SKILL.md',
      'skills/example/SKILL.md',
    ]);
  });

  test('what it wrote loads as the plugin it says, with no issue', async () => {
    const input: ScaffoldInput = { name: 'my-tool', scope: 'user', withSkills: true };
    const probed = await probeFolder(written(input), 'my-tool', 'skills-dir');
    expect(probed.plugin?.id).toBe('my-tool@skills-dir');
    const loaded = await loadPlugin({ files: written(input) });
    expect(loaded.plugin?.name).toBe('my-tool');
    expect(messagesOf(loaded.issues)).toEqual([]);
  });

  test("a name that cannot be a plugin's writes nothing", () => {
    const refused = planPluginScaffold({ name: 'my tool', scope: 'user' });
    expect('plan' in refused).toBe(false);
    expect('issues' in refused && refused.issues[0]).toMatchObject({
      severity: 'error',
      path: 'name',
    });
  });
});

const commandsOf = async (input: ScaffoldInput) => {
  const loaded = await loadPlugin({ files: written(input) });
  if (!loaded.plugin) throw new Error('did not load');
  const rootSkill = await written(input).readText('SKILL.md');
  return skillsDirCommands(loaded.plugin, { name: input.name, scope: input.scope, rootSkill });
};

spec("install.develop.Name the plugin's skills", () => {
  test('the root skill is a personal skill: /my-tool, not /my-tool:my-tool', async () => {
    expect(await commandsOf({ name: 'my-tool', scope: 'user' })).toEqual(['/my-tool']);
  });

  test('skills under skills/ get the plugin-name prefix', async () => {
    expect(await commandsOf({ name: 'my-tool', scope: 'user', withSkills: true })).toEqual([
      '/my-tool',
      '/my-tool:example',
    ]);
  });

  test('a project skill folder names its root skill the same way', async () => {
    expect(await commandsOf({ name: 'my-tool', scope: 'project' })).toEqual(['/my-tool']);
  });
});

spec('install.develop.Share the plugin through a repository', () => {
  test('init writes to the personal skills directory; the same layout in a project goes under .claude/skills/<name>/', () => {
    expect(planOf({ name: 'my-tool', scope: 'user' }).directory).toBe('~/.claude/skills/my-tool');
    const project = planOf({ name: 'my-tool', scope: 'project' });
    expect(project.directory).toBe('.claude/skills/my-tool');
    expect(project.files.map((file) => file.path)).toContain('.claude-plugin/plugin.json');
  });

  test('the project copy is the same plugin, @skills-dir by its manifest', async () => {
    const probed = await probeFolder(
      written({ name: 'my-tool', scope: 'project' }),
      'my-tool',
      'skills-dir',
    );
    expect(probed.plugin?.id).toBe('my-tool@skills-dir');
  });

  describe('it loads for everyone only under the conditions of the loading page', () => {
    const facts = {
      origin: 'skills-dir',
      trust: 'trusted',
      primaryDirIsRoot: true,
      worktree: false,
    } as const;

    test('the personal copy loads without a trust check, the repository copy needs the folder trusted', () => {
      expect(
        decideRepositoryPlugin({ ...facts, origin: 'user-skills-dir', trust: 'dialog' }).load,
      ).toBe(true);
      expect(decideRepositoryPlugin({ ...facts, trust: 'dialog' }).load).toBe(false);
      expect(decideRepositoryPlugin(facts).load).toBe(true);
    });
  });
});
