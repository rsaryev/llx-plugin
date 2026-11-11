/**
 * The rows of the same-name table of skills.md, "Resolve skills that share a name", whose first cell is
 * a phrase (the extractor reads them since `PageScope.phrases`): an added directory against the
 * project's own locations, two added directories, a synced skill's short name. The rows about a
 * plugin skill, a bundled skill and a built-in command are host tests (`tests/host/`).
 */
import { expect, test } from 'bun:test';
import { commandsOf, HOME, MANAGED, PROJECT, resolvedOf, skillText } from '../../support/scan.ts';
import { spec } from '../../support/spec.ts';

const at = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const ID = 'skills.behavior.Resolve skills that share a name';

/** The skill a command name runs, as the description of the folder it came from. */
async function runs(files: Record<string, string>, name: string, scenario = {}) {
  const resolution = await resolvedOf(files, scenario);
  return resolution.resolved.find((each) => each.names.includes(name))?.invocable.description;
}

spec(
  `${ID}.An enterprise, personal, or project skill and a skill in an added directory outside the project`,
  () => {
    const added = { request: { addedDirectories: ['/work/cli'] } };

    test.each([
      ['enterprise', MANAGED],
      ['personal', HOME],
      ['project', PROJECT],
    ])(
      'the %s skill runs and the added directory skill runs under a prefixed name',
      async (_scope, root) => {
        const files = {
          [at(root, 'verify')]: skillText('local verify'),
          [at('/work/cli', 'verify')]: skillText('cli verify'),
        };
        expect(await runs(files, 'verify', added)).toBe('local verify');
        expect(await runs(files, 'cli:verify', added)).toBe('cli verify');
        expect(commandsOf(await resolvedOf(files, added))).toEqual(['cli:verify', 'verify']);
      },
    );
  },
);

spec(`${ID}.Two added directories outside the project`, () => {
  test('the skill from the directory added first runs; the other runs under a prefixed name', async () => {
    const scenario = { request: { addedDirectories: ['/work/b', '/work/a'] } };
    const files = {
      [at('/work/a', 'verify')]: skillText('from a'),
      [at('/work/b', 'verify')]: skillText('from b'),
    };
    expect(await runs(files, 'verify', scenario)).toBe('from b');
    expect(await runs(files, 'a:verify', scenario)).toBe('from a');
  });
});

spec(
  `${ID}.Any of the above and the short name of a skill synced from your claude.ai account`,
  () => {
    const synced = `${HOME}/.claude/skills/synced/deploy/SKILL.md`;

    test.each([
      ['an enterprise skill', at(MANAGED, 'deploy')],
      ['a personal skill', at(HOME, 'deploy')],
      ['a project skill', at(PROJECT, 'deploy')],
      ['a command file', `${PROJECT}/.claude/commands/deploy.md`],
    ])(
      '%s keeps /deploy and the synced skill runs only as /anthropic-skills:deploy',
      async (_kind, local) => {
        const files = { [local]: skillText('local'), [synced]: skillText('synced') };
        expect(await runs(files, 'deploy')).toBe('local');
        expect(await runs(files, 'anthropic-skills:deploy')).toBe('synced');
        const entry = (await resolvedOf(files)).resolved.find((each) => each.scope === 'synced');
        expect(entry?.names).toEqual(['anthropic-skills:deploy']);
      },
    );

    test('a built-in command, a plugin skill or an MCP prompt that uses the name keeps it too', async () => {
      const resolution = await resolvedOf({ [synced]: skillText('synced') }, { taken: ['deploy'] });
      expect(resolution.resolved[0]?.names).toEqual(['anthropic-skills:deploy']);
    });
  },
);
