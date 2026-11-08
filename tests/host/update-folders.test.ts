/**
 * Cross-stream integration: skills.md § Edit a skill during a session; settings-reference.md §
 * strictPluginOnlyCustomization; hooks.md § Common input fields. State lifetimes and host.update
 * caching are judgments in spec/judgments.md, not compatibility claims.
 */
import { expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { agentFile, namesOf } from '../support/agent-host.ts';
import { textOf } from '../support/expand.ts';
import { signal } from '../support/host.ts';
import { folderHostOf, menuOf, PROJECT, HOME, skillText } from '../support/scan.ts';
import { layerOf } from '../support/settings-layers.ts';

test('turn views retain scanned folders, and a host update filters them before the next reload', async () => {
  const { host, session } = folderHostOf({
    [`${PROJECT}/.claude/skills/ship/SKILL.md`]: skillText('shipping'),
    [`${HOME}/.claude/agents/reviewer.md`]: agentFile('reviewer'),
  });
  await session.reloadSkills({ signal: signal() });
  await session.reloadAgents({ signal: signal() });
  const turn = session.withTurn({ permissionMode: 'plan' });
  expect(menuOf(turn)).toContain('ship');
  expect(namesOf(turn)).toContain('reviewer');
  host.update({
    settings: createPolicyView([
      layerOf('managed', { strictPluginOnlyCustomization: { skills: true, agents: true } }),
    ]),
  });
  expect(menuOf(session)).not.toContain('ship');
  expect(menuOf(turn)).not.toContain('ship');
  expect(namesOf(session)).not.toContain('reviewer');
  expect(namesOf(turn)).not.toContain('reviewer');
  expect((await turn.expandSkill('ship', { signal: signal() })).ok).toBe(false);
});

test('a turn with another cwd scans its own folders without changing the original view', async () => {
  const { session } = folderHostOf(
    {
      [`${PROJECT}/.claude/skills/project/SKILL.md`]: skillText('project'),
      '/elsewhere/.claude/skills/other/SKILL.md': skillText('other'),
    },
    { disk: { repositories: [PROJECT, '/elsewhere'] } },
  );
  await session.reloadSkills({ signal: signal() });
  const turn = session.withTurn({ cwd: '/elsewhere' });
  await turn.reloadSkills({ signal: signal() });
  expect(menuOf(turn)).toEqual(['other']);
  expect(menuOf(session)).toEqual(['project']);
});

test('moveTo changes the cwd of later shell placeholders on every view of that context', async () => {
  const { session, runner } = folderHostOf(
    {
      [`${PROJECT}/.claude/skills/here/SKILL.md`]: '---\ndescription: here\n---\n!`pwd`',
      '/elsewhere/.claude/skills/here/SKILL.md': '---\ndescription: here\n---\n!`pwd`',
    },
    {
      disk: { repositories: [PROJECT, '/elsewhere'] },
      session: { permissions: () => 'allow' },
      runs: [{ stdout: '/elsewhere' }],
    },
  );
  await session.reloadSkills({ signal: signal() });
  const turn = session.withTurn({ permissionMode: 'plan' });
  await session.moveTo('/elsewhere', { signal: signal() });
  expect(textOf(await turn.expandSkill('here', { signal: signal() }))).toBe('/elsewhere');
  expect(runner.calls[0]?.cwd).toBe('/elsewhere');
});
