/**
 * The folder state a turn keeps (docs/API.md, "Turns"): a turn naming the session's own working
 * directory is the same session, so the folders it read stay listed; a turn that moves the cwd
 * reads the folders of its own cwd and keeps the directories added with `/add-dir`. Integration
 * tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { folderHostOf, menuOf, skillText } from '../support/scan.ts';

const MONO = '/work/mono';
const EXTRA = '/work/extra';
const skillFile = (root: string, name: string) => `${root}/.claude/skills/${name}/SKILL.md`;
const files = (): Record<string, string> => ({
  [skillFile(MONO, 'release')]: skillText('root release'),
  [skillFile(`${MONO}/app`, 'deploy')]: skillText('app deploy'),
  [skillFile(EXTRA, 'lint')]: skillText('extra lint'),
});
const here = (cwd: string) => ({ session: { cwd }, disk: { repositories: [MONO, EXTRA] } });

describe('a turn and the folders of the session', () => {
  test('a turn naming the same cwd keeps the folder skills already read', async () => {
    const { session } = folderHostOf(files(), here(`${MONO}/app`));
    await session.reloadSkills({ signal: signal() });
    const listed = menuOf(session);
    expect(listed).toContain('deploy');
    expect(menuOf(session.withTurn({ cwd: `${MONO}/app` }))).toEqual(listed);
  });

  test('a turn moving the cwd keeps the directories added with /add-dir', async () => {
    const { session } = folderHostOf(files(), here(`${MONO}/app`));
    await session.addDirectory(EXTRA, { signal: signal() });
    const moved = session.withTurn({ cwd: MONO });
    await moved.reloadSkills({ signal: signal() });
    expect(menuOf(moved)).toEqual(['lint', 'release']);
  });
});
