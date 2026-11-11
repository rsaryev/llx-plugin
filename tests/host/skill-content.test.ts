/**
 * `session.skillContent(name)`: a host that pins a skill reads its body and directory through the
 * same entries `expandSkill` finds it in (every name it answers to, the same reader), with none of an
 * invocation's steps: `disable-model-invocation` and `skillOverrides` do not apply, no `!` command
 * runs, nothing is substituted, no base-directory line is added (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { layerOf } from '../support/settings-layers.ts';
import { HOME, folderHostOf } from '../support/scan.ts';
import { signal } from '../support/host.ts';

const dirOf = (name: string) => `${HOME}/.claude/skills/${name}`;
const BODY = 'Run !`echo hello` in ${CLAUDE_SKILL_DIR} with $ARGUMENTS.';

async function opened(frontmatter = 'description: d', settings?: unknown) {
  const files = { [`${dirOf('pin')}/SKILL.md`]: `---\n${frontmatter}\n---\n${BODY}` };
  const fixture =
    settings === undefined ? {} : { settings: createPolicyView([layerOf('user', settings)]) };
  const { session, runner } = folderHostOf(files, fixture);
  await session.reloadSkills({ signal: signal() });
  return { session, runner };
}

test('the body as written and the absolute directory and file, with no command run', async () => {
  const { session, runner } = await opened();
  const content = await session.skillContent('pin', { signal: signal() });
  if (!content.ok) throw new Error('the skill was not read');
  expect(content.skill.body).toBe(BODY);
  expect(content.skill).toMatchObject({
    name: 'pin',
    path: `${dirOf('pin')}/SKILL.md`,
    dir: dirOf('pin'),
  });
  expect(content.skill.body).not.toContain('Base directory for this skill');
  expect(runner.calls).toHaveLength(0);
});

test('a skill Claude may not invoke is read all the same: pinning is the host’s, not an invocation', async () => {
  const hidden = await opened('description: d\ndisable-model-invocation: true');
  expect((await hidden.session.skillContent('pin', { signal: signal() })).ok).toBe(true);
  const off = await opened('description: d', { skillOverrides: { pin: 'off' } });
  expect((await off.session.skillContent('pin', { signal: signal() })).ok).toBe(true);
});

test('an unknown name fails as expandSkill fails it', async () => {
  const { session } = await opened();
  const missing = await session.skillContent('nope', { signal: signal() });
  const expanded = await session.expandSkill('nope', { signal: signal() });
  expect(missing).toEqual({ ok: false, issues: expanded.ok ? [] : expanded.issues });
});

test('preloadSkills hands the same located content', async () => {
  const { session } = await opened();
  const content = await session.skillContent('pin', { signal: signal() });
  const { preloaded } = await session.preloadSkills({ skills: ['pin'] }, { signal: signal() });
  if (!content.ok) throw new Error('the skill was not read');
  expect(preloaded).toEqual([content.skill]);
});
