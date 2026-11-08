/**
 * Where skills load (skills.md, "Choose where skills load"): the personal, project, enterprise
 * (managed settings directory), nested and added-directory locations, the old command files, symlinked
 * folders and the names a skill folder cannot have. Over the folder-scan port, the scan of every scope
 * and the resolution of what it found.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import {
  commandsOf,
  HOME,
  MANAGED,
  PROJECT,
  resolvedOf,
  scanOf,
  skillText,
} from '../../support/scan.ts';

const listed = async (files: Record<string, string | { symlink: string }>, request = {}) =>
  commandsOf(await resolvedOf(files, { request }));

spec('skills.behavior.Choose where skills load.Personal', () => {
  test('~/.claude/skills/<name>/SKILL.md loads as a personal skill', async () => {
    const outcome = await scanOf({
      [`${HOME}/.claude/skills/triage/SKILL.md`]: skillText('Triage'),
    });
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['triage']);
    expect(outcome.entries[0]?.invocable.origin).toEqual({ kind: 'user' });
    expect(outcome.entries[0]?.scope).toBe('user');
  });

  test('a folder without a SKILL.md is not a skill', async () => {
    const outcome = await scanOf({ [`${HOME}/.claude/skills/notes/README.md`]: 'notes' });
    expect(outcome.entries).toEqual([]);
  });

  test('a personal skill loads in every project', async () => {
    const files = { [`${HOME}/.claude/skills/triage/SKILL.md`]: skillText('Triage') };
    expect(await listed(files, { cwd: '/work/one' })).toEqual(['triage']);
    expect(await listed(files, { cwd: '/work/two' })).toEqual(['triage']);
  });
});

spec('skills.behavior.Choose where skills load.Project', () => {
  test('.claude/skills/<name>/SKILL.md of the project loads as a project skill', async () => {
    const outcome = await scanOf({
      [`${PROJECT}/.claude/skills/ship/SKILL.md`]: skillText('Ship'),
    });
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['ship']);
    expect(outcome.entries[0]?.invocable.origin).toEqual({ kind: 'project' });
  });

  test('the skill is read from the project the session started in, not from another folder', async () => {
    const files = { '/work/other/.claude/skills/ship/SKILL.md': skillText('Ship') };
    expect(await listed(files)).toEqual([]);
  });
});

spec('skills.behavior.Choose where skills load.Enterprise', () => {
  test('.claude/skills/<name>/SKILL.md inside the managed settings directory loads for everyone', async () => {
    const outcome = await scanOf({
      [`${MANAGED}/.claude/skills/policy/SKILL.md`]: skillText('Policy'),
    });
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['policy']);
    expect(outcome.entries[0]?.invocable.origin).toEqual({ kind: 'managed' });
  });

  test('a host with no managed settings directory has no enterprise skills', async () => {
    const outcome = await scanOf(
      { [`${MANAGED}/.claude/skills/policy/SKILL.md`]: skillText('Policy') },
      { disk: { managed: undefined } },
    );
    expect(outcome.entries).toEqual([]);
  });
});

spec('skills.behavior.Choose where skills load.Additional directory', () => {
  test('the skills and the commands of a directory passed with --add-dir load', async () => {
    const outcome = await scanOf(
      {
        '/work/cli/.claude/skills/verify/SKILL.md': skillText('Verify'),
        '/work/cli/.claude/commands/lint.md': skillText('Lint'),
      },
      { request: { addedDirectories: ['/work/cli'] } },
    );
    expect(outcome.entries.map((entry) => entry.invocable.command).toSorted()).toEqual([
      'lint',
      'verify',
    ]);
    expect(outcome.entries.every((entry) => entry.scope === 'additional')).toBe(true);
  });

  test('a directory that was not added loads nothing', async () => {
    const files = { '/work/cli/.claude/skills/verify/SKILL.md': skillText('Verify') };
    expect(await listed(files)).toEqual([]);
  });
});

spec('skills.behavior.Choose where skills load.Command files', () => {
  test('a Markdown file in .claude/commands is a command, the older format', async () => {
    const outcome = await scanOf({
      [`${PROJECT}/.claude/commands/deploy.md`]: skillText('Deploy', 'argument-hint: <env>'),
    });
    const [entry] = outcome.entries;
    expect(entry?.invocable.kind).toBe('command');
    expect(entry?.invocable.argumentHint).toBe('<env>');
  });

  test('it supports the skill frontmatter except name and paths', async () => {
    const outcome = await scanOf({
      [`${HOME}/.claude/commands/deploy.md`]: skillText(
        'Deploy',
        'name: shipit',
        'paths: ["src/**"]',
        'disable-model-invocation: true',
      ),
    });
    const [entry] = outcome.entries;
    expect(entry?.invocable.command).toBe('deploy');
    expect(entry?.invocable.paths).toEqual([]);
    expect(entry?.invocable.disableModelInvocation).toBe(true);
  });
});

describe('symlinked folders', () => {
  spec('skills.behavior.Choose where skills load.Symlinked folders', () => {
    const target = '/shared/skills/review';

    test('a <skill-name> entry may be a symlink to a directory elsewhere on disk', async () => {
      const files = {
        [`${target}/SKILL.md`]: skillText('Review'),
        [`${HOME}/.claude/skills/review`]: { symlink: target },
      };
      const outcome = await scanOf(files);
      expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['review']);
      expect(outcome.entries[0]?.invocable.body).toContain('Review');
    });

    test('works in the enterprise and the project location too', async () => {
      const files = {
        [`${target}/SKILL.md`]: skillText('Review'),
        '/shared/skills/other/SKILL.md': skillText('Other'),
        [`${MANAGED}/.claude/skills/policy`]: { symlink: target },
        [`${PROJECT}/.claude/skills/ship`]: { symlink: '/shared/skills/other' },
      };
      const names = commandsOf(await resolvedOf(files));
      expect(names.toSorted()).toEqual(['policy', 'ship']);
    });

    test('the skill loads once even when several locations point at the same target', async () => {
      const files = {
        [`${target}/SKILL.md`]: skillText('Review'),
        [`${HOME}/.claude/skills/review`]: { symlink: target },
        [`${PROJECT}/.claude/skills/review`]: { symlink: target },
        [`${PROJECT}/.claude/skills/also-review`]: { symlink: target },
      };
      const resolution = await resolvedOf(files);
      expect(resolution.resolved).toHaveLength(1);
      expect(resolution.resolved[0]?.scope).toBe('user');
    });

    test('two real folders with the same content are two skills, not one', async () => {
      const files = {
        [`${HOME}/.claude/skills/review/SKILL.md`]: skillText('Review'),
        [`${PROJECT}/.claude/skills/audit/SKILL.md`]: skillText('Review'),
      };
      expect(commandsOf(await resolvedOf(files))).toEqual(['audit', 'review']);
    });
  });
});

describe('names a skill folder cannot have', () => {
  spec('skills.behavior.Choose where skills load.Reserved name synced', () => {
    test('a skill folder named synced, in any capitalization, is skipped in all three locations', async () => {
      const files = {
        [`${MANAGED}/.claude/skills/synced/SKILL.md`]: skillText('One'),
        [`${HOME}/.claude/skills/Synced/SKILL.md`]: skillText('Two'),
        [`${PROJECT}/.claude/skills/SYNCED/SKILL.md`]: skillText('Three'),
      };
      const outcome = await scanOf(files);
      expect(outcome.entries).toEqual([]);
      expect(outcome.issues.map((issue) => issue.severity)).toEqual(['error', 'error', 'error']);
    });

    test('~/.claude/skills/synced/ stays the folder of the skills downloaded from claude.ai', async () => {
      const outcome = await scanOf({
        [`${HOME}/.claude/skills/synced/pdf/SKILL.md`]: skillText('Pdf'),
      });
      expect(outcome.entries.map((entry) => entry.scope)).toEqual(['synced']);
    });
  });

  spec('skills.behavior.Choose where skills load.Reserved name anthropic-skills', () => {
    test('a skill folder or a command file named anthropic-skills does not load', async () => {
      const files = {
        [`${HOME}/.claude/skills/anthropic-skills/SKILL.md`]: skillText('One'),
        [`${PROJECT}/.claude/commands/anthropic-skills.md`]: skillText('Two'),
      };
      const outcome = await scanOf(files);
      expect(outcome.entries).toEqual([]);
      expect(outcome.issues).toHaveLength(2);
    });

    test('so does a name that starts with anthropic-skills: (a command subfolder, a frontmatter name)', async () => {
      const files = {
        [`${PROJECT}/.claude/commands/anthropic-skills/pdf.md`]: skillText('One'),
        [`${PROJECT}/.claude/skills/pdf/SKILL.md`]: skillText('Two', 'name: anthropic-skills:pdf'),
      };
      expect((await scanOf(files)).entries).toEqual([]);
    });

    test('a name that merely contains the word loads', async () => {
      const files = { [`${HOME}/.claude/skills/my-anthropic-skills/SKILL.md`]: skillText('One') };
      expect(await listed(files)).toEqual(['my-anthropic-skills']);
    });
  });

  spec('skills.behavior.Choose where skills load.Characters in the name', () => {
    test('a skill folder with a zero-width space or < in its name does not load outside a plugin', async () => {
      const files = {
        [`${HOME}/.claude/skills/de​ploy/SKILL.md`]: skillText('One'),
        [`${PROJECT}/.claude/skills/a<b/SKILL.md`]: skillText('Two'),
        [`${PROJECT}/.claude/skills/fine/SKILL.md`]: skillText('Three'),
      };
      const outcome = await scanOf(files);
      expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['fine']);
      expect(outcome.issues.filter((issue) => issue.severity === 'error')).toHaveLength(2);
    });
  });
});

spec('skills.behavior.Choose where skills load.Skill folder as a plugin', () => {
  const manifest = JSON.stringify({ name: 'toolbox' });

  test('a personal or project skill folder with .claude-plugin/plugin.json is a <name>@skills-dir plugin', async () => {
    const outcome = await scanOf({
      [`${HOME}/.claude/skills/toolbox/.claude-plugin/plugin.json`]: manifest,
      [`${HOME}/.claude/skills/toolbox/SKILL.md`]: skillText('Toolbox'),
      [`${PROJECT}/.claude/skills/kit/.claude-plugin/plugin.json`]: JSON.stringify({ name: 'kit' }),
    });
    expect(outcome.plugins).toEqual([
      {
        id: 'toolbox@skills-dir',
        name: 'toolbox',
        dir: `${HOME}/.claude/skills/toolbox`,
        scope: 'user',
        requiresTrust: false,
      },
      {
        id: 'kit@skills-dir',
        name: 'kit',
        dir: `${PROJECT}/.claude/skills/kit`,
        scope: 'project',
        requiresTrust: true,
      },
    ]);
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual(['toolbox']);
  });

  test('a plain skill folder, and a folder of the enterprise location, is no plugin', async () => {
    const outcome = await scanOf({
      [`${HOME}/.claude/skills/plain/SKILL.md`]: skillText('Plain'),
      [`${MANAGED}/.claude/skills/org/.claude-plugin/plugin.json`]: manifest,
    });
    expect(outcome.plugins).toEqual([]);
  });
});

spec('skills.behavior.Choose where skills load.claude.ai account', () => {
  test('the skills downloaded from the account into ~/.claude/skills/synced/ load in later sessions', async () => {
    const outcome = await scanOf({
      [`${HOME}/.claude/skills/synced/pdf/SKILL.md`]: skillText('Pdf'),
      [`${HOME}/.claude/skills/synced/xlsx/SKILL.md`]: skillText('Xlsx'),
    });
    expect(outcome.entries.map((entry) => entry.invocable.origin)).toEqual([
      { kind: 'synced' },
      { kind: 'synced' },
    ]);
    expect(outcome.entries.map((entry) => entry.invocable.command)).toEqual([
      'anthropic-skills:pdf',
      'anthropic-skills:xlsx',
    ]);
  });
});
