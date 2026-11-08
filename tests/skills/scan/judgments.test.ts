/**
 * What the docs leave open about reading the scope folders (spec/judgments.md): which folders are not
 * Claude Code locations, how skills of parent directories and command files rank, a skill folder that
 * is a plugin, the folders a session watches. Tested outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import {
  commandsOf,
  HOME,
  MANAGED,
  PROJECT,
  resolvedOf,
  scanOf,
  skillText,
} from '../../support/scan.ts';

const at = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;

describe('folders that are not Claude Code locations', () => {
  test('.agents/skills, .claude/plugins and a skills folder outside .claude are not read', async () => {
    const files = {
      [`${PROJECT}/.agents/skills/portable/SKILL.md`]: skillText('Portable'),
      [`${PROJECT}/.claude/plugins/p/skills/x/SKILL.md`]: skillText('Plugin'),
      [`${PROJECT}/skills/loose/SKILL.md`]: skillText('Loose'),
      [`${HOME}/.agents/skills/portable/SKILL.md`]: skillText('Portable'),
    };
    expect((await scanOf(files)).entries).toEqual([]);
  });

  test('a skill folder deeper than one level is not a skill', async () => {
    const files = { [`${PROJECT}/.claude/skills/group/inner/SKILL.md`]: skillText('Inner') };
    expect((await scanOf(files)).entries).toEqual([]);
  });
});

describe('the project chain', () => {
  test('outside a repository only the working directory is read', async () => {
    const files = {
      [at('/work', 'parent')]: skillText('Parent'),
      [at(PROJECT, 'here')]: skillText('Here'),
    };
    expect(commandsOf(await resolvedOf(files))).toEqual(['here']);
  });

  test('the same name in a parent and the working directory: the nearest runs', async () => {
    const files = {
      [at('/work/mono', 'deploy')]: skillText('root deploy'),
      [at('/work/mono/pkg', 'deploy')]: skillText('package deploy'),
    };
    const resolution = await resolvedOf(files, {
      request: { cwd: '/work/mono/pkg' },
      disk: { repositories: ['/work/mono'] },
    });
    expect(resolution.resolved.map((each) => each.invocable.description)).toEqual([
      'package deploy',
    ]);
  });
});

describe('command files', () => {
  test('personal over project over an added directory, with no prefix for the one that loses', async () => {
    const files = {
      [`${HOME}/.claude/commands/a.md`]: skillText('personal a'),
      [`${PROJECT}/.claude/commands/a.md`]: skillText('project a'),
      [`${PROJECT}/.claude/commands/b.md`]: skillText('project b'),
      '/work/cli/.claude/commands/b.md': skillText('cli b'),
    };
    const resolution = await resolvedOf(files, { request: { addedDirectories: ['/work/cli'] } });
    expect(
      resolution.resolved.map((each) => [each.invocable.command, each.invocable.description]),
    ).toEqual([
      ['a', 'personal a'],
      ['b', 'project b'],
    ]);
  });

  test('the managed directory has no commands folder, nested directories no commands', async () => {
    const files = {
      [`${MANAGED}/.claude/commands/org.md`]: skillText('Org'),
      [`${PROJECT}/apps/web/.claude/commands/web.md`]: skillText('Web'),
    };
    expect((await scanOf(files)).entries).toEqual([]);
  });
});

describe('the other names of a skill', () => {
  test('a clash is judged on the command name, the frontmatter name included', async () => {
    const files = {
      [at(HOME, 'deploy')]: skillText('personal'),
      [at(PROJECT, 'ship')]: skillText('project', 'name: deploy'),
    };
    const resolution = await resolvedOf(files);
    const project = resolution.resolved.find((each) => each.scope === 'project');
    expect(project?.invocable.command).toBe('ship');
  });

  test('a skill that loses every one of its names is reported as shadowed, never listed', async () => {
    const files = {
      [at(HOME, 'deploy')]: skillText('personal'),
      [at(PROJECT, 'deploy')]: skillText('project'),
    };
    const resolution = await resolvedOf(files);
    expect(resolution.shadowed).toEqual([
      { scope: 'project', command: 'deploy', path: `${PROJECT}/.claude/skills/deploy/SKILL.md` },
    ]);
  });
});

describe('a skill folder that is a plugin', () => {
  test('the id uses the folder name when the manifest has no readable name', async () => {
    const files = {
      [`${HOME}/.claude/skills/one/.claude-plugin/plugin.json`]: '{ not json',
      [`${HOME}/.claude/skills/two/.claude-plugin/plugin.json`]: '{"version":"1.0.0"}',
    };
    const { plugins } = await scanOf(files);
    expect(plugins.map((plugin) => plugin.id)).toEqual(['one@skills-dir', 'two@skills-dir']);
  });

  test('a project plugin is looked for in the working directory only, not in the parents', async () => {
    const files = {
      '/work/mono/.claude/skills/up/.claude-plugin/plugin.json': '{"name":"up"}',
      '/work/mono/pkg/.claude/skills/here/.claude-plugin/plugin.json': '{"name":"here"}',
    };
    const { plugins } = await scanOf(files, {
      request: { cwd: '/work/mono/pkg' },
      disk: { repositories: ['/work/mono'] },
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual(['here@skills-dir']);
  });
});

describe('added directories that share their last two folders', () => {
  test('the prefix takes more parents until the two differ', async () => {
    const dirs = ['/w/a/x/cli', '/w/b/x/cli'];
    const files = {
      [at(dirs[0] ?? '', 'verify')]: skillText('from a'),
      [at(dirs[1] ?? '', 'verify')]: skillText('from b'),
    };
    const resolution = await resolvedOf(files, { request: { addedDirectories: dirs } });
    expect(commandsOf(resolution)).toEqual(['b/x/cli:verify', 'verify']);
  });
});
