/**
 * sub-agents.md § Preload skills into subagents: "The full content of each skill is injected into
 * the subagent's context, not just made available for invocation"; a listed skill that is missing or
 * that Claude cannot invoke is skipped; "up to the first 32 distinct names"; preloading does not grant
 * the Skill tool. `session.preloadSkills` finds a name as `expandSkill` does and applies the same
 * invocation policy, `skillOverrides` included.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { layerOf } from '../support/settings-layers.ts';
import { HOME, folderHostOf } from '../support/scan.ts';
import { spec } from '../support/spec.ts';
import { names } from '../support/tool-pool.ts';
import { signal } from '../support/host.ts';

const skillFile = (name: string) => `${HOME}/.claude/skills/${name}/SKILL.md`;
const skill = (name: string, extra = '') =>
  `---\ndescription: Short description\n${extra}\n---\nFull instructions for ${name}.`;

async function preload(
  files: Record<string, string>,
  listed: readonly string[],
  settings?: unknown,
) {
  const { session } = folderHostOf(
    files,
    settings === undefined ? {} : { settings: createPolicyView([layerOf('user', settings)]) },
  );
  await session.reloadSkills({ signal: signal() });
  return session.preloadSkills({ skills: [...listed] }, { signal: signal() });
}

spec('agents.behavior.Preload skills into subagents', () => {
  test('only explicitly listed, known, model-invocable skills have their full content injected', async () => {
    const files = {
      [skillFile('api')]: skill('api'),
      [skillFile('security')]: skill('security'),
      [skillFile('user-only')]: skill('user-only', 'disable-model-invocation: true'),
    };
    const outcome = await preload(files, ['api', 'missing', 'user-only']);
    expect(outcome.preloaded.map((entry) => [entry.name, entry.body])).toEqual([
      ['api', 'Full instructions for api.'],
    ]);
    expect(outcome.skipped).toEqual([
      { name: 'missing', reason: 'missing' },
      { name: 'user-only', reason: 'not-model-invocable' },
    ]);
    expect((await preload(files, [])).preloaded).toEqual([]);
  });

  test('preloading does not grant the Skill tool; that tool can be granted separately', async () => {
    const outcome = await preload({ [skillFile('api')]: skill('api') }, ['api']);
    expect(outcome.preloaded).toHaveLength(1);
    expect(names({ tools: ['Read'] })).not.toContain('Skill');
    expect(names({ tools: ['Read', 'Skill'] })).toContain('Skill');
  });

  test('the injected set is capped at 32, so the remaining skills require later invocation', async () => {
    const listed = Array.from({ length: 35 }, (_, index) => `skill-${index}`);
    const files = Object.fromEntries(listed.map((name) => [skillFile(name), skill(name)]));
    const outcome = await preload(files, listed);
    expect(outcome.preloaded).toHaveLength(32);
    expect(outcome.preloaded.at(-1)?.name).toBe('skill-31');
  });
});

describe('the same skills Claude can invoke (judgments: spec/judgments.md)', () => {
  test('a skill skillOverrides hides from Claude is not preloaded', async () => {
    const files = { [skillFile('api')]: skill('api'), [skillFile('ops')]: skill('ops') };
    const outcome = await preload(files, ['api', 'ops'], {
      skillOverrides: { api: 'off', ops: 'user-invocable-only' },
    });
    expect(outcome.preloaded).toEqual([]);
    expect(outcome.skipped.map((each) => each.reason)).toEqual([
      'not-model-invocable',
      'not-model-invocable',
    ]);
  });

  test('the body is as written: no substitution, no command runs', async () => {
    const body = 'Context: !`echo hello` ${CLAUDE_SKILL_DIR}';
    const files = { [skillFile('api')]: `---\ndescription: d\n---\n${body}` };
    const { session, runner } = folderHostOf(files);
    await session.reloadSkills({ signal: signal() });
    const outcome = await session.preloadSkills({ skills: ['api'] }, { signal: signal() });
    expect(outcome.preloaded[0]?.body).toBe(body);
    expect(runner.calls).toHaveLength(0);
  });
});
