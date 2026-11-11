/**
 * Where each folder skill came from and what name it gave up (skills.md, "When a synced skill name
 * matches another command": the `claude.ai sync` group of `/skills` and "a note under the list [that]
 * explains each synced skill that lost its short name ... says what to rename or delete to free it").
 * The data a host builds that view from: integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { HOME, PROJECT, folderHostOf, skillText } from '../support/scan.ts';

const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const synced = (name: string) => `${HOME}/.claude/skills/synced/${name}/SKILL.md`;

async function sourcesOf(
  files: Record<string, string>,
  session: Parameters<typeof folderHostOf>[1] = {},
) {
  const host = folderHostOf(files, session);
  await host.session.reloadSkills({ signal: signal() });
  return host.session.skillSources();
}

describe('the sources of the listed skills', () => {
  test('each entry says its scope and origin, so a host can group the synced ones', async () => {
    const { entries } = await sourcesOf({
      [skillFile(HOME, 'mine')]: skillText('Mine'),
      [skillFile(PROJECT, 'ship')]: skillText('Ship'),
      [synced('pdf')]: skillText('Pdf'),
    });
    expect(entries.map((entry) => [entry.command, entry.scope, entry.origin.kind])).toEqual([
      ['mine', 'user', 'user'],
      ['ship', 'project', 'project'],
      ['pdf', 'synced', 'synced'],
    ]);
    expect(entries.map((entry) => entry.names)).toEqual([
      ['mine'],
      ['ship'],
      ['pdf', 'anthropic-skills:pdf'],
    ]);
  });

  test('a synced skill that lost its short name to a personal skill says who holds it', async () => {
    const { entries } = await sourcesOf({
      [skillFile(HOME, 'deploy')]: skillText('personal'),
      [synced('deploy')]: skillText('synced'),
    });
    const lost = entries.find((entry) => entry.scope === 'synced');
    expect(lost?.names).toEqual(['anthropic-skills:deploy']);
    expect(lost?.yielded).toEqual([
      { name: 'deploy', heldBy: { scope: 'user', path: skillFile(HOME, 'deploy') } },
    ]);
  });

  test('a personal command file holds the name the same way', async () => {
    const { entries } = await sourcesOf({
      [`${HOME}/.claude/commands/deploy.md`]: skillText('command file'),
      [synced('deploy')]: skillText('synced'),
    });
    const lost = entries.find((entry) => entry.scope === 'synced');
    expect(lost?.yielded.map((each) => each.heldBy?.scope)).toEqual(['user']);
    expect(lost?.yielded[0]?.heldBy?.path).toBe(`${HOME}/.claude/commands/deploy.md`);
  });

  test('a command another source uses is named without a holder: nothing in ~/.claude to rename', async () => {
    const { entries } = await sourcesOf(
      { [synced('usage')]: skillText('synced') },
      { session: { takenCommands: ['usage'] } },
    );
    expect(entries[0]?.yielded).toEqual([{ name: 'usage', heldBy: undefined }]);
  });

  test('a synced skill that kept its short name gave up nothing', async () => {
    const { entries } = await sourcesOf({ [synced('pdf')]: skillText('Pdf') });
    expect(entries[0]?.yielded).toEqual([]);
  });

  test('a skill that lost every name is in shadowed, not in the entries', async () => {
    const { entries, shadowed } = await sourcesOf({
      [skillFile(HOME, 'deploy')]: skillText('personal'),
      [skillFile(PROJECT, 'deploy')]: skillText('project'),
    });
    expect(entries.map((entry) => entry.scope)).toEqual(['user']);
    expect(shadowed).toEqual([
      { scope: 'project', command: 'deploy', path: skillFile(PROJECT, 'deploy') },
    ]);
  });

  test('before the first read nothing is listed', () => {
    const { session } = folderHostOf({});
    expect(session.skillSources()).toEqual({ entries: [], shadowed: [] });
  });
});
