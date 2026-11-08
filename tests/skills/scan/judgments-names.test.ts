/**
 * What the docs leave open about names of the folders' skills (spec/judgments.md), tested outside
 * `spec()`: a dot-folder other than `.trash`, the commands other sources use against a skill of the
 * folders, and how local names are compared.
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

describe('a dot-folder in a skills folder', () => {
  test('any other dot-folder is read like a plain folder, and .trash is not', async () => {
    const files = {
      [at(PROJECT, '.drafts')]: skillText('Drafts'),
      [at(PROJECT, '.trash')]: skillText('Trash'),
      [at(PROJECT, 'plain')]: skillText('Plain'),
    };
    const outcome = await scanOf(files);
    expect(outcome.entries.map((entry) => entry.invocable.command).toSorted()).toEqual([
      '.drafts',
      'plain',
    ]);
  });
});

describe('commands other sources use against a skill of the folders', () => {
  test('taken never blocks a skill or a command file of the folders, whatever its scope', async () => {
    const files = {
      [at(MANAGED, 'policy')]: skillText('policy'),
      [at(HOME, 'usage')]: skillText('personal usage'),
      [at(PROJECT, 'code-review')]: skillText('project review'),
      [`${PROJECT}/.claude/commands/lint.md`]: skillText('lint'),
    };
    const taken = ['policy', 'usage', 'code-review', 'lint'];
    const resolution = await resolvedOf(files, { taken });
    expect(commandsOf(resolution)).toEqual(['code-review', 'lint', 'policy', 'usage']);
    expect(resolution.shadowed).toEqual([]);
  });

  test('an added directory skill with a taken name is not given a prefix for it', async () => {
    const files = { [at('/work/cli', 'usage')]: skillText('cli usage') };
    const resolution = await resolvedOf(files, {
      taken: ['usage'],
      request: { addedDirectories: ['/work/cli'] },
    });
    expect(commandsOf(resolution)).toEqual(['usage']);
  });
});

describe('local names are compared exactly', () => {
  test('Commit and commit are two names: both skills load, each under its own', async () => {
    const files = {
      [at(HOME, 'Commit')]: skillText('upper'),
      [at(PROJECT, 'commit')]: skillText('lower'),
    };
    const resolution = await resolvedOf(files);
    expect(commandsOf(resolution)).toEqual(['Commit', 'commit']);
    expect(resolution.shadowed).toEqual([]);
  });

  test('a command file and a skill with names that differ by case both load', async () => {
    const files = {
      [at(PROJECT, 'Deploy')]: skillText('skill'),
      [`${PROJECT}/.claude/commands/deploy.md`]: skillText('command'),
    };
    expect(commandsOf(await resolvedOf(files))).toEqual(['Deploy', 'deploy']);
  });
});
