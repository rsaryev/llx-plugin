/**
 * Characters a skill name can't hold (skills.md, "Characters a skill name can't hold", "Choose where
 * skills load"): outside a plugin a skill folder, a command file and a folder inside `.claude/commands/`
 * whose name has one of the listed classes does not load. One case per class, for each of the three
 * places a name comes from. (`tests/format/skill-name.test.ts` proves the classes on the name itself.)
 */
import { describe, expect, test } from 'bun:test';
import { HOME, PROJECT, scanOf, skillText } from '../../support/scan.ts';
import { spec } from '../../support/spec.ts';

/** Each class the section lists, with a name that holds it. */
const CLASSES: readonly (readonly [string, string])[] = [
  ['a zero-width space', 'de​ploy'],
  ['a control character', 'de\u0007ploy'],
  ['a private-use character', 'deploy'],
  ['an unassigned character', 'de͸ploy'],
  ['a character that changes the direction of the text', 'de‮ploy'],
  ['a no-break space', 'de ploy'],
  ['two spaces in a row', 'de  ploy'],
  ['a space at the start', ' deploy'],
  ['a space at the end', 'deploy '],
  ['<', 'de<ploy'],
  ['>', 'de>ploy'],
];

const loads = async (files: Record<string, string>): Promise<readonly string[]> => {
  const outcome = await scanOf(files);
  return outcome.entries.map((entry) => entry.invocable.command);
};

const errors = async (files: Record<string, string>): Promise<number> => {
  const outcome = await scanOf(files);
  return outcome.issues.filter((issue) => issue.severity === 'error').length;
};

spec('skills.behavior.Choose where skills load.Characters in the name', () => {
  describe.each(CLASSES)('%s', (_class, name) => {
    test('in a skill folder name: the skill does not load', async () => {
      const files = {
        [`${HOME}/.claude/skills/${name}/SKILL.md`]: skillText('Bad'),
        [`${PROJECT}/.claude/skills/fine/SKILL.md`]: skillText('Fine'),
      };
      expect(await loads(files)).toEqual(['fine']);
      expect(await errors(files)).toBe(1);
    });

    test('in a command file name: the command does not load', async () => {
      const files = {
        [`${PROJECT}/.claude/commands/${name}.md`]: skillText('Bad'),
        [`${PROJECT}/.claude/commands/fine.md`]: skillText('Fine'),
      };
      expect(await loads(files)).toEqual(['fine']);
      expect(await errors(files)).toBe(1);
    });

    test('in a folder of .claude/commands/: the commands below it do not load', async () => {
      const files = {
        [`${PROJECT}/.claude/commands/${name}/run.md`]: skillText('Bad'),
        [`${PROJECT}/.claude/commands/fine/run.md`]: skillText('Fine'),
      };
      expect(await loads(files)).toEqual(['fine:run']);
      expect(await errors(files)).toBe(1);
    });
  });

  test('a single plain space between words is a name a folder can have', async () => {
    const files = { [`${PROJECT}/.claude/skills/my skill/SKILL.md`]: skillText('Spaced') };
    expect(await loads(files)).toEqual(['my skill']);
  });
});
