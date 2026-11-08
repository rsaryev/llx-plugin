/**
 * What changes during a session (skills.md, "Edit a skill during a session", "Remove a skill",
 * "Personal skills disappeared", "Where you write the skill's name", "Choose where skills load"):
 * the plugins' skills and the folders' side by side, `reloadSkills` as `/reload-skills`, a touched file
 * as the trigger of the nested ones. End-to-end over the real loader, the scan, the resolution and the
 * fakes of the ports.
 */
import { describe, expect, test } from 'bun:test';
import { readSkillMentions } from '../../src/skills/index.ts';
import { bundledSkills } from '../../src/settings/skills/index.ts';
import { spec } from '../support/spec.ts';
import { FORMATTER, standardPlugins, signal } from '../support/host.ts';
import { HOME, MANAGED, PROJECT, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { viewOf } from '../support/plugin-settings.ts';

/** The id holds an apostrophe, which the static id check cannot read inside a literal; `spec()` still refuses an unknown one. */
const WHERE_YOU_WRITE = "skills.behavior.Where you write the skill's name";

const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const reload = (session: { reloadSkills(o: { signal: AbortSignal }): Promise<unknown> }) =>
  session.reloadSkills({ signal: signal() });

describe('edit a skill during a session', () => {
  spec('skills.behavior.Edit a skill during a session', () => {
    test('adding, editing and removing a skill under the personal, project and added directories shows at the next read', async () => {
      const added = '/work/cli';
      const files: Record<string, string> = {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(PROJECT, 'two')]: skillText('Two'),
        [skillFile(added, 'three')]: skillText('Three'),
      };
      const { session } = folderHostOf(files, { session: { addedDirectories: [added] } });
      await reload(session);
      expect(menuOf(session)).toEqual(['one', 'three', 'two']);

      files[skillFile(HOME, 'one')] = skillText('One edited');
      files[skillFile(PROJECT, 'four')] = skillText('Four');
      delete files[skillFile(added, 'three')];
      await reload(session);
      expect(menuOf(session)).toEqual(['four', 'one', 'two']);
      const expansion = await session.expandSkill('one', { signal: signal() });
      expect(expansion.ok && expansion.text).toContain('One edited');
    });

    test('the session watches the skills directories that exist: personal, project and added, not the commands or the managed one', async () => {
      const added = '/work/cli';
      const files: Record<string, string> = {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(PROJECT, 'two')]: skillText('Two'),
        [skillFile(added, 'three')]: skillText('Three'),
        [`${added}/.claude/commands/cmd.md`]: skillText('Cmd'),
        [skillFile(MANAGED, 'policy')]: skillText('Policy'),
      };
      const { session } = folderHostOf(files, { session: { addedDirectories: [added] } });
      const outcome = await reload(session);
      expect(outcome).toBeDefined();
      const watched = (await session.reloadSkills({ signal: signal() })).watch.toSorted();
      expect(watched).toEqual(
        [
          `${HOME}/.claude/skills`,
          `${PROJECT}/.claude/skills`,
          `${added}/.claude/skills`,
        ].toSorted(),
      );
    });

    test('a top-level skills directory created during the session is watched only after /reload-skills', async () => {
      const files: Record<string, string> = { [skillFile(HOME, 'one')]: skillText('One') };
      const { session } = folderHostOf(files);
      const before = await session.reloadSkills({ signal: signal() });
      expect(before.watch).toEqual([`${HOME}/.claude/skills`]);
      files[skillFile(PROJECT, 'fresh')] = skillText('Fresh');
      expect(menuOf(session)).toEqual(['one']);
      const after = await session.reloadSkills({ signal: signal() });
      expect(after.watch.toSorted()).toEqual([
        `${HOME}/.claude/skills`,
        `${PROJECT}/.claude/skills`,
      ]);
      expect(menuOf(session)).toEqual(['fresh', 'one']);
    });

    test('live detection covers SKILL.md only: a skill folder that is also a plugin is reported as a plugin to reload', async () => {
      const files: Record<string, string> = {
        [skillFile(HOME, 'toolbox')]: skillText('Toolbox'),
        [`${HOME}/.claude/skills/toolbox/.claude-plugin/plugin.json`]: '{"name":"toolbox"}',
        [`${HOME}/.claude/skills/toolbox/hooks/hooks.json`]: '{"hooks":{}}',
      };
      const { session } = folderHostOf(files);
      const outcome = await session.reloadSkills({ signal: signal() });
      expect(outcome.plugins.map((plugin) => plugin.id)).toEqual(['toolbox@skills-dir']);
      expect(menuOf(session)).toEqual(['toolbox']);
    });
  });
});

describe('remove a skill', () => {
  spec('skills.behavior.Remove a skill.Personal or project skill', () => {
    test('deleting the skill directory drops it from the session', async () => {
      const files: Record<string, string> = {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(PROJECT, 'two')]: skillText('Two'),
      };
      const { session } = folderHostOf(files);
      await reload(session);
      delete files[skillFile(HOME, 'one')];
      delete files[skillFile(PROJECT, 'two')];
      await reload(session);
      expect(menuOf(session)).toEqual([]);
    });

    test('keeping the skill but stopping the model from invoking it: disable-model-invocation or skillOverrides', async () => {
      const files = {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(PROJECT, 'two')]: skillText('Two', 'disable-model-invocation: true'),
      };
      const settings = viewOf(['user', { skillOverrides: { one: 'user-invocable-only' } }]);
      const { session } = folderHostOf(files, { settings });
      await reload(session);
      expect(menuOf(session)).toEqual(['one', 'two']);
      expect(session.skills().model.entries).toEqual([]);
    });
  });

  spec('skills.behavior.Remove a skill.Enterprise skill', () => {
    test('an administrator deleting the directory from the managed settings .claude/skills removes it', async () => {
      const files: Record<string, string> = { [skillFile(MANAGED, 'policy')]: skillText('Policy') };
      const { session } = folderHostOf(files);
      await reload(session);
      expect(menuOf(session)).toEqual(['policy']);
      delete files[skillFile(MANAGED, 'policy')];
      await reload(session);
      expect(menuOf(session)).toEqual([]);
    });
  });

  spec('skills.behavior.Remove a skill.Plugin skill', () => {
    test('disabling the plugin that provides it unloads its skills', async () => {
      const [formatter, ...rest] = await standardPlugins();
      if (formatter === undefined) throw new Error('fixture');
      const on = folderHostOf({}, { plugins: [formatter, ...rest] });
      expect(menuOf(on.session)).toContain('formatter:review');
      const off = folderHostOf({}, { plugins: [{ ...formatter, enabled: false }, ...rest] });
      expect(menuOf(off.session).some((name) => name.startsWith('formatter:'))).toBe(false);
    });

    test('enabledPlugins false in the settings does the same', async () => {
      const settings = viewOf(['user', { enabledPlugins: { [FORMATTER]: false } }]);
      const { session } = folderHostOf({}, { plugins: await standardPlugins(), settings });
      expect(menuOf(session).some((name) => name.startsWith('formatter:'))).toBe(false);
    });
  });

  spec('skills.behavior.Remove a skill.Bundled skill', () => {
    test('disableBundledSkills true turns off the bundled skills', () => {
      const decision = bundledSkills(viewOf(['user', { disableBundledSkills: true }]), {});
      expect(decision.disabled).toBe(true);
      expect(bundledSkills(viewOf(), {}).disabled).toBe(false);
    });

    test('one skill set to off in skillOverrides is hidden from the model and the menu', async () => {
      const files = {
        [skillFile(HOME, 'one')]: skillText('One'),
        [skillFile(HOME, 'two')]: skillText('Two'),
      };
      const settings = viewOf(['user', { skillOverrides: { two: 'off' } }]);
      const { session } = folderHostOf(files, { settings });
      await reload(session);
      expect(menuOf(session)).toEqual(['one']);
      expect(session.skills().model.entries.map((entry) => entry.name)).toEqual(['one']);
    });
  });
});

spec('skills.behavior.Personal skills disappeared', () => {
  test('skills moved to ~/.claude/skills/.trash/ do not load; moving one back restores it', async () => {
    const files: Record<string, string> = {
      [skillFile(HOME, 'kept')]: skillText('Kept'),
      [`${HOME}/.claude/skills/.trash/2026-01-01/lost/SKILL.md`]: skillText('Lost'),
      [`${HOME}/.claude/skills/.trash/SKILL.md`]: skillText('Trash itself'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    expect(menuOf(session)).toEqual(['kept']);
    files[skillFile(HOME, 'lost')] =
      files[`${HOME}/.claude/skills/.trash/2026-01-01/lost/SKILL.md`] ?? '';
    delete files[`${HOME}/.claude/skills/.trash/2026-01-01/lost/SKILL.md`];
    await reload(session);
    expect(menuOf(session)).toEqual(['kept', 'lost']);
  });

  test('a manifest.json in ~/.claude/skills/ does not take the skill folders it lists out of the session', async () => {
    const files = {
      [`${HOME}/.claude/skills/manifest.json`]: JSON.stringify({ skills: ['one', 'two'] }),
      [skillFile(HOME, 'one')]: skillText('One'),
      [skillFile(HOME, 'two')]: skillText('Two'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    expect(menuOf(session)).toEqual(['one', 'two']);
  });

  test('the skills synced from claude.ai live in the separate synced folder, beside the ones you created', async () => {
    const files = {
      [skillFile(HOME, 'mine')]: skillText('Mine'),
      [`${HOME}/.claude/skills/synced/pdf/SKILL.md`]: skillText('Pdf'),
    };
    const { session } = folderHostOf(files);
    await reload(session);
    expect(menuOf(session)).toEqual(['mine', 'pdf']);
  });
});

describe('where you write the skill name', () => {
  spec(WHERE_YOU_WRITE, () => {
    test('at the start of the message the skill runs directly: /deploy staging', () => {
      expect(readSkillMentions('/deploy staging')).toEqual([
        { how: 'direct', command: 'deploy', arguments: 'staging' },
      ]);
    });

    test('after plain text, as a separate word, the name is the permission to run it and runs nothing directly', () => {
      expect(readSkillMentions('go ahead and /deploy to staging')).toEqual([
        { how: 'named', command: 'deploy' },
      ]);
    });

    test('with punctuation attached, or written without the slash, it is neither', () => {
      expect(readSkillMentions('go ahead and /deploy, then stop')).toEqual([]);
      expect(readSkillMentions('write about deploy without permitting it')).toEqual([]);
    });

    test('a directory-qualified name the session lists is one word', () => {
      const names = new Set(['apps/web:deploy', 'cli:verify']);
      expect(readSkillMentions('/apps/web:deploy now', { names })).toEqual([
        { how: 'direct', command: 'apps/web:deploy', arguments: 'now' },
      ]);
      expect(readSkillMentions('then /cli:verify please', { names })).toEqual([
        { how: 'named', command: 'cli:verify' },
      ]);
      expect(readSkillMentions('read /usr/bin/env', { names })).toEqual([]);
    });
  });
});

spec('skills.behavior.Choose where skills load.Plugin', () => {
  test('a plugin skill loads wherever the plugin is enabled, as /plugin-name:skill-name', async () => {
    const files = { [skillFile(PROJECT, 'review')]: skillText('project review') };
    const { session } = folderHostOf(files, { plugins: await standardPlugins() });
    await reload(session);
    const menu = menuOf(session);
    expect(menu).toContain('formatter:review');
    expect(menu).toContain('review');
  });
});
