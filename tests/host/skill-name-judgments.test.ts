/**
 * What the docs leave open about the names and directories of a session (spec/judgments.md), tested
 * outside `spec()`: the bare name of a plugin skill, `permissions.additionalDirectories` against the
 * directories added with `--add-dir`, and the main checkout a linked worktree borrows from.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSession } from '../../src/host/index.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
import { viewOf } from '../support/plugin-settings.ts';
import { PROJECT, folderHostOf, menuOf, skillText } from '../support/scan.ts';

const json = (value: unknown): string => JSON.stringify(value);
const skill = (...lines: readonly string[]): string =>
  ['---', ...lines, '---', 'Do the work.'].join('\n');

async function pluginOf(name: string, tree: Record<string, string>) {
  const plugin = await loaded({ '.claude-plugin/plugin.json': json({ name }), ...tree });
  return { id: `${name}@acme`, plugin };
}

const typed = async (session: PluginSession, name: string) =>
  (await session.expandSkill(name, { signal: signal() })).ok;

describe('the bare name of a plugin skill', () => {
  test('a skill that keeps its folder name has no bare name', async () => {
    const { host } = await hostOf({
      plugins: [await pluginOf('p', { 'skills/review/SKILL.md': skill('description: Review') })],
    });
    const session = host.openSession(SESSION);
    expect(await typed(session, 'p:review')).toBe(true);
    expect(await typed(session, 'review')).toBe(false);
  });

  test('a skill whose name equals its folder name has no bare name either', async () => {
    const { host } = await hostOf({
      plugins: [
        await pluginOf('p', { 'skills/review/SKILL.md': skill('name: review', 'description: R') }),
      ],
    });
    expect(await typed(host.openSession(SESSION), 'review')).toBe(false);
  });

  test('a root SKILL.md has no bare name, whatever its name', async () => {
    const { host } = await hostOf({
      plugins: [await pluginOf('p', { 'SKILL.md': skill('name: solo', 'description: Solo') })],
    });
    const session = host.openSession(SESSION);
    expect(await typed(session, 'p:solo')).toBe(true);
    expect(await typed(session, 'solo')).toBe(false);
  });

  test('two plugins whose skills choose one bare name: the first plugin wins it, the other keeps its full name', async () => {
    const tree = { 'skills/a/SKILL.md': skill('name: fancy', 'description: Fancy') };
    const { host } = await hostOf({
      plugins: [await pluginOf('first', tree), await pluginOf('second', tree)],
    });
    const session = host.openSession(SESSION);
    const bare = await session.expandSkill('fancy', { signal: signal() });
    expect(bare.ok).toBe(true);
    const listed = session.skills().menu.map((entry) => entry.name);
    expect(listed.toSorted()).toEqual(['first:fancy', 'second:fancy']);
    expect(await typed(session, 'second:fancy')).toBe(true);
  });
});

describe('additional directories of a settings file and added directories', () => {
  const files = { '/work/cli/.claude/skills/verify/SKILL.md': skillText('cli verify') };

  test('permissions.additionalDirectories and SessionOptions.additionalDirectories give file access and load no skill', async () => {
    const settings = viewOf(['user', { permissions: { additionalDirectories: ['/work/cli'] } }]);
    const { session } = folderHostOf(files, {
      settings,
      session: { additionalDirectories: ['/work/cli'] },
    });
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual([]);
  });

  test('addedDirectories (--add-dir) of the same directory loads its skills', async () => {
    const { session } = folderHostOf(files, { session: { addedDirectories: ['/work/cli'] } });
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual(['verify']);
  });
});

describe('the main checkout of a linked worktree', () => {
  const MAIN = '/work/main';
  const disk = { repositories: [MAIN], worktrees: { [PROJECT]: MAIN } };

  test('without its own .claude/skills the worktree also borrows the main checkout commands, as the worktrees.md bullet names them, and no plugin', async () => {
    const files = {
      [`${MAIN}/.claude/skills/release/SKILL.md`]: skillText('release'),
      [`${MAIN}/.claude/commands/lint.md`]: skillText('lint'),
      [`${MAIN}/.claude/skills/toolbox/.claude-plugin/plugin.json`]: '{"name":"toolbox"}',
      [`${PROJECT}/src/index.ts`]: 'code',
    };
    const { session } = folderHostOf(files, { disk });
    const outcome = await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual(['lint', 'release']);
    expect(outcome.plugins).toEqual([]);
  });

  test('a worktree with its own .claude/skills borrows nothing, commands included', async () => {
    const files = {
      [`${MAIN}/.claude/commands/lint.md`]: skillText('lint'),
      [`${PROJECT}/.claude/skills/own/SKILL.md`]: skillText('own'),
    };
    const { session } = folderHostOf(files, { disk });
    await session.reloadSkills({ signal: signal() });
    expect(menuOf(session)).toEqual(['own']);
  });
});
