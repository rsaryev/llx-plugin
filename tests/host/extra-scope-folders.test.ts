/**
 * `PluginHostOptions.extraScopeFolders`: the one host option that names folders beside `.claude` for
 * the skills, commands and agents scans of every session (a judgment, spec/judgments.md; the units are
 * tests/skills/scan/extra-folders.test.ts and tests/agents/catalog/extra-folders.test.ts). End-to-end
 * over the real host and the fakes of the ports: outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { agentFile, namesOf, reload } from '../support/agent-host.ts';
import { signal } from '../support/host.ts';
import { HOME, PROJECT, folderHostOf, menuOf, skillText } from '../support/scan.ts';

const files = {
  [`${PROJECT}/.agents/skills/lint/SKILL.md`]: skillText('Lint'),
  [`${HOME}/.agents/agents/helper.md`]: agentFile('helper'),
  [`${PROJECT}/.claude/skills/deploy/SKILL.md`]: skillText('Deploy'),
};

describe('judgment: a host names extra scope folders once, for every session', () => {
  test('the sessions read the skills and agents of the extra folders', async () => {
    const { session } = folderHostOf(files, { extraScopeFolders: ['.agents'] });
    await session.reloadSkills({ signal: signal() });
    await reload(session);
    expect(menuOf(session)).toEqual(expect.arrayContaining(['deploy', 'lint']));
    expect(namesOf(session)).toContain('helper');
  });

  test('a host that names none reads .claude alone', async () => {
    const { session } = folderHostOf(files);
    await session.reloadSkills({ signal: signal() });
    await reload(session);
    expect(menuOf(session)).not.toContain('lint');
    expect(namesOf(session)).not.toContain('helper');
  });
});
