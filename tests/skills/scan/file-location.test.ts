/**
 * Where a skill or command file of a scope goes, below the scope's folder (skills.md, "Choose where
 * skills load": `~/.claude/skills/<skill-name>/SKILL.md`, `.claude/skills/<skill-name>/SKILL.md`,
 * and "Command files" in `.claude/commands/`): the rule the scan reads by, as a function. Each path
 * written there is read back by the scan as the skill or command of that name.
 */
import { describe, expect, test } from 'bun:test';
import { scopeFilePath } from '../../../src/skills/index.ts';
import { HOME, MANAGED, PROJECT, scanOf, skillText } from '../../support/scan.ts';
import { spec } from '../../support/spec.ts';

const commandsAt = async (path: string) =>
  (await scanOf({ [path]: skillText('Made here') })).entries.map(
    (entry) => entry.invocable.command,
  );

spec('skills.behavior.Choose where skills load.Personal', () => {
  test('a personal skill goes to skills/<name>/SKILL.md of the configuration folder', async () => {
    const path = scopeFilePath('user', 'skill', `${HOME}/.claude`, 'triage');
    expect(path).toBe(`${HOME}/.claude/skills/triage/SKILL.md`);
    expect(await commandsAt(path ?? '')).toEqual(['triage']);
  });
});

spec('skills.behavior.Choose where skills load.Project', () => {
  test('a project skill goes below the project .claude folder', async () => {
    const path = scopeFilePath('project', 'skill', `${PROJECT}/.claude`, 'deploy');
    expect(path).toBe(`${PROJECT}/.claude/skills/deploy/SKILL.md`);
    expect(await commandsAt(path ?? '')).toEqual(['deploy']);
  });
});

spec('skills.behavior.Choose where skills load.Command files', () => {
  test('a command goes to commands/<name>.md, a folder for each part before a colon', async () => {
    expect(scopeFilePath('project', 'command', `${PROJECT}/.claude`, 'review')).toBe(
      `${PROJECT}/.claude/commands/review.md`,
    );
    const nested = scopeFilePath('user', 'command', `${HOME}/.claude`, 'git:log');
    expect(nested).toBe(`${HOME}/.claude/commands/git/log.md`);
    expect(await commandsAt(nested ?? '')).toEqual(['git:log']);
  });
});

describe('a scope that reads no such file', () => {
  test('managed, nested and synced read no commands', () => {
    expect(scopeFilePath('managed', 'skill', `${MANAGED}/.claude`, 'x')).toBe(
      `${MANAGED}/.claude/skills/x/SKILL.md`,
    );
    expect(scopeFilePath('managed', 'command', `${MANAGED}/.claude`, 'x')).toBeUndefined();
    expect(scopeFilePath('nested', 'command', `${PROJECT}/a/.claude`, 'x')).toBeUndefined();
    expect(scopeFilePath('synced', 'command', `${HOME}/.claude`, 'x')).toBeUndefined();
  });
});
