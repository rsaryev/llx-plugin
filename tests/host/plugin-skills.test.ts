/**
 * The skills and commands of a plugin as a session lists them (plugins/components.md, "Skills",
 * "Commands", "Define commands in the manifest"; skills.md, "How a skill gets its command name",
 * "Characters a skill name can't hold"; plugins/troubleshooting.md, "Plugin loads but its skills are
 * missing", "Skill loads but Claude never invokes the skill", "commands path not found"): the real
 * loader, the format readers and a host over the fakes.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugin } from '../../src/loading/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { folderHostOf } from '../support/scan.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

/** The id holds an apostrophe, which the static id check cannot read inside a literal; `spec()` still refuses an unknown one. */
const CHARACTERS = "skills.behavior.Characters a skill name can't hold";

const json = (value: unknown): string => JSON.stringify(value);
const manifest = (extra: object = {}) => json({ name: 'my-plugin', ...extra });
const skill = (...lines: readonly string[]): string =>
  ['---', ...lines, '---', 'Do the work.'].join('\n');

async function sessionOf(tree: Record<string, string>) {
  const plugin = await loaded({ '.claude-plugin/plugin.json': manifest(), ...tree });
  const { host } = await hostOf({ plugins: [{ id: 'my-plugin@acme', plugin }] });
  return host.openSession(SESSION);
}

const menu = (session: Awaited<ReturnType<typeof sessionOf>>) =>
  session
    .skills()
    .menu.map((entry) => entry.name)
    .toSorted();

describe('how a plugin skill gets its command name', () => {
  spec('skills.behavior.How a skill gets its command name.skills/', () => {
    test('skills/review/SKILL.md is /my-plugin:review', async () => {
      const session = await sessionOf({ 'skills/review/SKILL.md': skill('description: Review') });
      expect(menu(session)).toEqual(['my-plugin:review']);
    });

    test('the frontmatter name replaces the last segment: name: fancy is /my-plugin:fancy', async () => {
      const session = await sessionOf({
        'skills/review/SKILL.md': skill('name: fancy', 'description: Review'),
      });
      expect(menu(session)).toEqual(['my-plugin:fancy']);
    });

    test('the bare /fancy also invokes the skill unless another command already uses that name', async () => {
      const pluginFiles = {
        '.claude-plugin/plugin.json': manifest(),
        'skills/review/SKILL.md': skill('name: fancy', 'description: Review'),
      };
      const session = await sessionOf(pluginFiles);
      const bare = await session.expandSkill('fancy', { signal: signal() });
      expect(bare.ok).toBe(true);
      const namedByFolder = await session.expandSkill('review', { signal: signal() });
      expect(namedByFolder.ok).toBe(false);
      const local = folderHostOf(
        { '/work/app/.claude/skills/fancy/SKILL.md': '---\ndescription: Local\n---\nLocal body.' },
        { plugins: [{ id: 'my-plugin@acme', plugin: await loaded(pluginFiles) }] },
      );
      await local.session.reloadSkills({ signal: signal() });
      const wins = await local.session.expandSkill('fancy', { signal: signal() });
      expect(wins.ok && wins.text).toContain('Local body.');
      const full = await local.session.expandSkill('my-plugin:fancy', { signal: signal() });
      expect(full.ok).toBe(true);
    });

    test('a name that already starts with the plugin prefix is not prefixed again (v2.1.246 and later)', async () => {
      const session = await sessionOf({
        'skills/review/SKILL.md': skill('name: my-plugin:fancy', 'description: Review'),
      });
      expect(menu(session)).toEqual(['my-plugin:fancy']);
    });
  });

  spec('skills.behavior.How a skill gets its command name.SKILL.md', () => {
    test('a plugin root SKILL.md takes its frontmatter name: name: review is /my-plugin:review', async () => {
      const session = await sessionOf({ 'SKILL.md': skill('name: review', 'description: Review') });
      expect(menu(session)).toEqual(['my-plugin:review']);
    });

    test('with no name, the plugin directory name is the fallback', async () => {
      const files = { 'SKILL.md': skill('description: Review') };
      const { plugin } = await loadPlugin({ files: memoryFiles(files), fallbackName: 'my-plugin' });
      if (plugin === undefined) throw new Error('the plugin does not load');
      const { host } = await hostOf({ plugins: [{ id: 'my-plugin@acme', plugin }] });
      expect(menu(host.openSession(SESSION))).toEqual(['my-plugin:my-plugin']);
    });
  });

  spec(CHARACTERS, () => {
    test('a skill still loads when the characters are only in a plugin skill folder name: they become hyphens', async () => {
      const session = await sessionOf({
        'skills/de​ploy/SKILL.md': skill('description: Deploy'),
        'skills/a<b/SKILL.md': skill('description: Angle'),
      });
      expect(menu(session)).toEqual(['my-plugin:a-b', 'my-plugin:de-ploy']);
    });

    test('in the frontmatter name the name is not used: the folder names the skill', async () => {
      const session = await sessionOf({
        'skills/deploy/SKILL.md': skill('name: "de​ploy"', 'description: Deploy'),
      });
      expect(menu(session)).toEqual(['my-plugin:deploy']);
      expect((await session.expandSkill('de​ploy', { signal: signal() })).ok).toBe(false);
    });
  });
});

describe('plugins/components.md, Skills', () => {
  spec('skills.components.Skills.Command name', () => {
    test('/<plugin>:<directory>, and name replaces the last segment with the plugin prefix in place', async () => {
      const session = await sessionOf({
        'skills/review/SKILL.md': skill('description: Review'),
        'skills/lint/SKILL.md': skill('name: tidy', 'description: Lint'),
      });
      expect(menu(session)).toEqual(['my-plugin:review', 'my-plugin:tidy']);
    });
  });

  spec('skills.components.Skills.Who invokes it', () => {
    test('Claude, the user or both, by the frontmatter', async () => {
      const session = await sessionOf({
        'skills/both/SKILL.md': skill('description: Both'),
        'skills/user-only/SKILL.md': skill('description: User', 'disable-model-invocation: true'),
        'skills/claude-only/SKILL.md': skill('description: Claude', 'user-invocable: false'),
      });
      const { model, menu: slash } = session.skills();
      expect(model.entries.map((entry) => entry.name).toSorted()).toEqual([
        'my-plugin:both',
        'my-plugin:claude-only',
      ]);
      expect(slash.map((entry) => entry.name).toSorted()).toEqual([
        'my-plugin:both',
        'my-plugin:user-only',
      ]);
      const userRun = await session.expandSkill('my-plugin:user-only', { signal: signal() });
      expect(userRun.ok).toBe(true);
      const modelRun = await session.expandSkill('my-plugin:user-only', {
        invoker: 'model',
        signal: signal(),
      });
      expect(modelRun.ok).toBe(false);
    });
  });

  spec('skills.components.Skills.Additional directories', () => {
    test('the skills key adds to the default skills/ scan; commands and agents are replaced', async () => {
      const plugin = await loaded({
        '.claude-plugin/plugin.json': manifest({
          skills: ['./extra-skills'],
          commands: ['./extra-commands'],
          agents: ['./extra-agents/one.md'],
        }),
        'skills/a/SKILL.md': skill('description: A'),
        'extra-skills/b/SKILL.md': skill('description: B'),
        'commands/default.md': skill('description: Default command'),
        'extra-commands/c.md': skill('description: C'),
        'agents/default.md': '---\nname: default\ndescription: Default\n---\nPrompt.',
        'extra-agents/one.md': '---\nname: one\ndescription: One\n---\nPrompt.',
      });
      expect(plugin.skills.map((file) => file.name).toSorted()).toEqual(['a', 'b']);
      expect(plugin.commands.map((file) => file.name)).toEqual(['c']);
      expect(plugin.agents.map((file) => file.name)).toEqual(['one']);
    });
  });

  spec('skills.components.Skills.A single skill at the plugin root', () => {
    test('with no skills/ directory and no skills key, SKILL.md at the root loads as one skill', async () => {
      const session = await sessionOf({ 'SKILL.md': skill('name: solo', 'description: Solo') });
      expect(menu(session)).toEqual(['my-plugin:solo']);
    });

    test('a skills/ directory or a skills key turns that off', async () => {
      const withDirectory = await sessionOf({
        'SKILL.md': skill('name: solo', 'description: Solo'),
        'skills/a/SKILL.md': skill('description: A'),
      });
      expect(menu(withDirectory)).toEqual(['my-plugin:a']);
    });
  });
});

describe('commands in the manifest', () => {
  spec('commands.components.Define commands in the manifest', () => {
    test('the commands key replaces the scan of commands/; an object maps a name to a source file or inline content', async () => {
      const plugin = await loaded({
        '.claude-plugin/plugin.json': manifest({
          commands: {
            about: {
              content: 'Summarize what this repository does in three sentences.',
              description: 'Summarize the repository',
            },
            status: { source: './docs/status.md', argumentHint: '[env]' },
          },
        }),
        'commands/ignored.md': skill('description: Never read'),
        'docs/status.md': skill('description: Status'),
      });
      const { host } = await hostOf({ plugins: [{ id: 'my-plugin@acme', plugin }] });
      const session = host.openSession(SESSION);
      expect(menu(session)).toEqual(['my-plugin:about', 'my-plugin:status']);
      const about = await session.expandSkill('my-plugin:about', { signal: signal() });
      expect(about.ok && about.text).toBe(
        'Summarize what this repository does in three sentences.',
      );
      expect(
        session.skills().menu.find((entry) => entry.name === 'my-plugin:about')?.description,
      ).toBe('Summarize the repository');
    });

    test('a path or an array of paths replaces commands/ too', async () => {
      const plugin = await loaded({
        '.claude-plugin/plugin.json': manifest({ commands: ['./cmds', './one.md'] }),
        'commands/ignored.md': skill('description: Never read'),
        'cmds/db/migrate.md': skill('description: Migrate'),
        'one.md': skill('description: One'),
      });
      expect(plugin.commands.map((file) => file.name).toSorted()).toEqual(['db:migrate', 'one']);
    });
  });
});
