/**
 * sub-agents.md § Preload skills into subagents: full bodies rather than discovery descriptions,
 * explicit skill lists instead of inheritance, unknown names skipped, model-disabled skills refused,
 * the 32-skill cap, and preloading independent of later access to the Skill tool.
 */
import { expect, test } from 'bun:test';
import { preloadAgentSkills } from '../../src/agents/preloaded-content.ts';
import { readSkill } from '../../src/format/skill.ts';
import { names } from '../support/tool-pool.ts';
import { spec } from '../support/spec.ts';

const skill = (name: string, hidden = false) =>
  readSkill(
    `${name}/SKILL.md`,
    `---\nname: ${name}\ndescription: Short description\ndisable-model-invocation: ${hidden}\n---\nFull instructions for ${name}.`,
    { origin: { kind: 'project' }, dirName: name },
  ).skill;

spec('agents.behavior.Preload skills into subagents', () => {
  test('only explicitly listed, known, model-invocable skills have their full content injected', () => {
    const skills = [skill('api'), skill('security'), skill('user-only', true)];
    const outcome = preloadAgentSkills({ skills: ['api', 'missing', 'user-only'] }, skills);
    expect(outcome.preloaded.map((entry) => [entry.name, entry.body])).toEqual([
      ['api', 'Full instructions for api.'],
    ]);
    expect(preloadAgentSkills({}, skills).preloaded).toEqual([]);
  });

  test('preloading does not grant the Skill tool; that tool can be granted separately', () => {
    const preloaded = preloadAgentSkills({ skills: ['api'] }, [skill('api')]);
    expect(preloaded.preloaded).toHaveLength(1);
    expect(names({ tools: ['Read'] })).not.toContain('Skill');
    expect(names({ tools: ['Read', 'Skill'] })).toContain('Skill');
  });

  test('the injected set is capped at 32, so the remaining skills require later invocation', () => {
    const skills = Array.from({ length: 35 }, (_, index) => skill(`skill-${index}`));
    const outcome = preloadAgentSkills({ skills: skills.map((entry) => entry.name) }, skills);
    expect(outcome.preloaded).toHaveLength(32);
    expect(outcome.preloaded.at(-1)?.name).toBe('skill-31');
  });
});
