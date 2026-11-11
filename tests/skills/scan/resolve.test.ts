/**
 * Which one runs when skills share a name (skills.md, "Resolve skills that share a name", "How a skill
 * gets its command name", "Run a same-named skill from an added directory", "When a synced skill name
 * matches another command"): the documented examples, in the order of their tables.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { commandsOf, HOME, MANAGED, PROJECT, resolvedOf, skillText } from '../../support/scan.ts';

const at = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;

/** The skill a command name runs, as the description of the folder it came from. */
async function runs(files: Record<string, string>, name: string, scenario = {}) {
  const resolution = await resolvedOf(files, scenario);
  const found = resolution.resolved.find((each) => each.names.includes(name));
  return found?.invocable.description;
}

spec(
  'skills.behavior.Resolve skills that share a name.Two of enterprise, personal, and project',
  () => {
    test('with deploy in both ~/.claude/skills/ and the project, /deploy runs the personal one', async () => {
      const files = {
        [at(HOME, 'deploy')]: skillText('personal deploy'),
        [at(PROJECT, 'deploy')]: skillText('project deploy'),
      };
      expect(await runs(files, 'deploy')).toBe('personal deploy');
    });

    test('enterprise over personal', async () => {
      const files = {
        [at(MANAGED, 'deploy')]: skillText('enterprise deploy'),
        [at(HOME, 'deploy')]: skillText('personal deploy'),
      };
      expect(await runs(files, 'deploy')).toBe('enterprise deploy');
    });

    test('enterprise over project, and over both', async () => {
      const files = {
        [at(MANAGED, 'deploy')]: skillText('enterprise deploy'),
        [at(PROJECT, 'deploy')]: skillText('project deploy'),
        [at(HOME, 'deploy')]: skillText('personal deploy'),
      };
      expect(await runs(files, 'deploy')).toBe('enterprise deploy');
      const resolution = await resolvedOf(files);
      expect(resolution.resolved).toHaveLength(1);
      expect(resolution.shadowed.map((each) => each.scope)).toEqual(['user', 'project']);
    });

    test('the same name set by the frontmatter name field decides the same way', async () => {
      const files = {
        [at(HOME, 'a')]: skillText('personal', 'name: deploy'),
        [at(PROJECT, 'b')]: skillText('project', 'name: deploy'),
      };
      expect(await runs(files, 'deploy')).toBe('personal');
    });

    test('a skill with other names is not affected', async () => {
      const files = {
        [at(HOME, 'deploy')]: skillText('personal deploy'),
        [at(PROJECT, 'release')]: skillText('project release'),
      };
      expect(commandsOf(await resolvedOf(files))).toEqual(['deploy', 'release']);
    });
  },
);

spec('skills.behavior.Resolve skills that share a name..claude/commands/', () => {
  test('a skill and a file in .claude/commands/ of one name: the skill runs', async () => {
    const files = {
      [at(PROJECT, 'deploy')]: skillText('the skill'),
      [`${PROJECT}/.claude/commands/deploy.md`]: skillText('the command file'),
    };
    const resolution = await resolvedOf(files);
    expect(resolution.resolved.map((each) => each.invocable.description)).toEqual(['the skill']);
  });

  test('the skill wins whichever scope the command file is in', async () => {
    const files = {
      [at(PROJECT, 'deploy')]: skillText('the skill'),
      [`${HOME}/.claude/commands/deploy.md`]: skillText('personal command'),
    };
    expect(await runs(files, 'deploy')).toBe('the skill');
  });
});

describe('an added directory', () => {
  const added = { request: { addedDirectories: ['/work/cli'] } };

  spec('skills.behavior.Run a same-named skill from an added directory', () => {
    test('with --add-dir ../cli and a verify skill in both: /verify runs the project, /cli:verify the added one', async () => {
      const files = {
        [at(PROJECT, 'verify')]: skillText('project verify'),
        [at('/work/cli', 'verify')]: skillText('cli verify'),
      };
      expect(await runs(files, 'verify', added)).toBe('project verify');
      expect(await runs(files, 'cli:verify', added)).toBe('cli verify');
      const listed = commandsOf(await resolvedOf(files, added));
      expect(listed).toEqual(['cli:verify', 'verify']);
    });

    test('the prefix is the added directory when the clash is with an enterprise or personal skill too', async () => {
      const files = {
        [at(MANAGED, 'verify')]: skillText('enterprise verify'),
        [at('/work/cli', 'verify')]: skillText('cli verify'),
      };
      expect(await runs(files, 'verify', added)).toBe('enterprise verify');
      expect(await runs(files, 'cli:verify', added)).toBe('cli verify');
      const personal = { [at(HOME, 'verify')]: skillText('personal verify'), ...files };
      expect(await runs(personal, 'cli:verify', added)).toBe('cli verify');
    });

    test('a skill of an added directory with a free name keeps it, with no prefix', async () => {
      const files = { [at('/work/cli', 'verify')]: skillText('cli verify') };
      expect(commandsOf(await resolvedOf(files, added))).toEqual(['verify']);
    });

    test('two added directories: the skill from the one added first runs, the other has a prefix', async () => {
      const scenario = { request: { addedDirectories: ['/work/a', '/work/b'] } };
      const files = {
        [at('/work/a', 'verify')]: skillText('from a'),
        [at('/work/b', 'verify')]: skillText('from b'),
      };
      expect(await runs(files, 'verify', scenario)).toBe('from a');
      expect(await runs(files, 'b:verify', scenario)).toBe('from b');
    });

    test('two added directories sharing a folder name: the prefix starts with the parent folder', async () => {
      const scenario = { request: { addedDirectories: ['/work/a/cli', '/work/b/cli'] } };
      const files = {
        [at('/work/a/cli', 'verify')]: skillText('from a/cli'),
        [at('/work/b/cli', 'verify')]: skillText('from b/cli'),
      };
      expect(await runs(files, 'verify', scenario)).toBe('from a/cli');
      expect(await runs(files, 'b/cli:verify', scenario)).toBe('from b/cli');
    });
  });
});

describe('how a skill gets its command name', () => {
  spec('skills.behavior.How a skill gets its command name.~/.claude/skills/', () => {
    test('the frontmatter name or the directory name: .claude/skills/deploy-staging is /deploy-staging, or /deploy with name: deploy', async () => {
      const files = { [at(HOME, 'deploy-staging')]: skillText('Deploy', 'name: deploy') };
      const [only] = (await resolvedOf(files)).resolved;
      expect(only?.invocable.command).toBe('deploy');
      expect(only?.names).toEqual(['deploy', 'deploy-staging']);
      const plain = (await resolvedOf({ [at(HOME, 'deploy-staging')]: skillText('Deploy') }))
        .resolved[0];
      expect(plain?.invocable.command).toBe('deploy-staging');
    });

    test('the name sets the command unless another command already uses it; the directory name still invokes the skill', async () => {
      const files = {
        [at(MANAGED, 'deploy')]: skillText('enterprise'),
        [at(HOME, 'deploy-staging')]: skillText('personal', 'name: deploy'),
      };
      const resolution = await resolvedOf(files);
      const personal = resolution.resolved.find((each) => each.scope === 'user');
      expect(personal?.invocable.command).toBe('deploy-staging');
      expect(personal?.names).toEqual(['deploy-staging']);
    });
  });

  spec('skills.behavior.How a skill gets its command name..claude/skills/', () => {
    test('a project skill directory is named the same way', async () => {
      const files = {
        [at(PROJECT, 'deploy-staging')]: skillText('Deploy', 'name: deploy'),
        [at(PROJECT, 'lint')]: skillText('Lint'),
      };
      const resolution = await resolvedOf(files);
      expect(commandsOf(resolution)).toEqual(['deploy', 'lint']);
      expect(resolution.resolved[0]?.names).toEqual(['deploy', 'deploy-staging']);
    });
  });

  spec('skills.behavior.How a skill gets its command name..claude/commands/', () => {
    test('a file is its name without the extension', async () => {
      const files = { [`${PROJECT}/.claude/commands/deploy.md`]: skillText('Deploy') };
      expect(commandsOf(await resolvedOf(files))).toEqual(['deploy']);
    });

    test('a file in a subdirectory: the path below commands/ with / replaced by :', async () => {
      const files = {
        [`${PROJECT}/.claude/commands/frontend/component.md`]: skillText('Component'),
        [`${HOME}/.claude/commands/a/b/c.md`]: skillText('Deep'),
      };
      expect(commandsOf(await resolvedOf(files))).toEqual(['a:b:c', 'frontend:component']);
    });
  });

  spec('skills.behavior.How a skill gets its command name.Skill synced from claude.ai', () => {
    const synced = (name: string) => `${HOME}/.claude/skills/synced/${name}/SKILL.md`;

    test('the account skill deploy is /anthropic-skills:deploy, or /deploy while no other command uses that name', async () => {
      const resolution = await resolvedOf({ [synced('deploy')]: skillText('Deploy') });
      const [only] = resolution.resolved;
      expect(only?.invocable.command).toBe('deploy');
      expect(only?.names).toEqual(['deploy', 'anthropic-skills:deploy']);
    });

    test('with a local deploy skill, /deploy runs the local one and /anthropic-skills:deploy the synced one', async () => {
      const files = {
        [synced('deploy')]: skillText('synced'),
        [at(PROJECT, 'deploy')]: skillText('local'),
      };
      expect(await runs(files, 'deploy')).toBe('local');
      expect(await runs(files, 'anthropic-skills:deploy')).toBe('synced');
      const syncedEntry = (await resolvedOf(files)).resolved.find(
        (each) => each.scope === 'synced',
      );
      expect(syncedEntry?.invocable.command).toBe('anthropic-skills:deploy');
    });

    test('a built-in command, a plugin skill or an MCP prompt that uses the short name also wins it', async () => {
      const files = { [synced('usage')]: skillText('synced') };
      const resolution = await resolvedOf(files, { taken: ['usage'] });
      expect(resolution.resolved[0]?.invocable.command).toBe('anthropic-skills:usage');
    });

    test('names compare ignoring case, spacing, invisible characters and compatibility forms', async () => {
      const files = {
        [synced('Commit')]: skillText('synced'),
        [at(PROJECT, 'commit')]: skillText('local'),
      };
      expect(await runs(files, 'commit')).toBe('local');
      const fullwidth = { [synced('Ｄeploy')]: skillText('synced') };
      const other = await resolvedOf(fullwidth, { taken: ['deploy'] });
      expect(other.resolved[0]?.invocable.command).toBe('anthropic-skills:Ｄeploy');
    });

    test('a name that differs only by a look-alike letter from another alphabet is a different name', async () => {
      const files = { [synced('сommit')]: skillText('synced') };
      const resolution = await resolvedOf(files, { taken: ['commit'] });
      expect(resolution.resolved[0]?.invocable.command).toBe('сommit');
    });
  });
});
