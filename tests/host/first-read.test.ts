/**
 * The first read of the folders. A session reads the skills and agents folders only when it is asked
 * to (`reloadSkills`, `reloadAgents`, and for skills `addDirectory` and `moveTo`): its catalogs are
 * synchronous and call no port. Until that first read, a session that has a folder port says so in
 * every view of its catalog, so a host never takes a list without the folders for a whole one
 * (judgment, spec/judgments.md: one rule for skills and agents). A session without the port has
 * nothing to read and says nothing.
 */
import { describe, expect, test } from 'bun:test';
import { signal } from '../support/host.ts';
import { HOME, folderHostOf, skillText } from '../support/scan.ts';

const FILES = {
  [`${HOME}/.claude/skills/one/SKILL.md`]: skillText('One'),
  [`${HOME}/.claude/agents/helper.md`]: '---\nname: helper\ndescription: Helps\n---\nHelp.',
};

const messagesOf = (issues: readonly { readonly message: string }[]) =>
  issues.map((issue) => issue.message);

describe('skills', () => {
  test('before the first read the catalog and the listing say the folders are not read', () => {
    const { session } = folderHostOf(FILES);
    const catalog = session.skillCatalog();
    expect(catalog.skills).toEqual([]);
    expect(messagesOf(catalog.issues)).toEqual([
      'the skills folders have not been read yet: call reloadSkills() before listing them',
    ]);
    expect(catalog.issues[0]?.severity).toBe('warning');
    expect(session.skills().issues).toEqual(catalog.issues);
  });

  test('after reloadSkills the list is whole and the issue is gone', async () => {
    const { session } = folderHostOf(FILES);
    await session.reloadSkills({ signal: signal() });
    const catalog = session.skillCatalog();
    expect(catalog.skills.map((row) => row.invocable.command)).toEqual(['one']);
    expect(catalog.issues).toEqual([]);
  });

  test('addDirectory reads the folders too', async () => {
    const { session } = folderHostOf(FILES);
    await session.addDirectory('/work/other', { signal: signal() });
    expect(session.skillCatalog().issues).toEqual([]);
  });

  test('a session without a folder port has nothing to read and no issue', () => {
    const { session } = folderHostOf(FILES, { withoutFolders: true });
    expect(session.skillCatalog().issues).toEqual([]);
  });
});

describe('agents follow the same rule', () => {
  test('before reloadAgents the catalog says the folders are not read; after, it lists them', async () => {
    const { session } = folderHostOf(FILES);
    expect(messagesOf(session.agentCatalog().issues)).toContain(
      'the agents folders have not been read yet: call reloadAgents() before listing them',
    );
    await session.reloadAgents({ signal: signal() });
    const catalog = session.agentCatalog();
    expect(catalog.issues).toEqual([]);
    expect(catalog.agents.map((agent) => agent.name)).toContain('helper');
  });

  test('without a folder port, no issue', () => {
    const { session } = folderHostOf(FILES, { withoutFolders: true });
    expect(session.agentCatalog().issues).toEqual([]);
  });
});
