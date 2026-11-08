/**
 * sub-agents.md § Frontmatter reference (`skills`), § Preload skills into subagents: "The full
 * content of each listed skill is injected into the subagent's context at startup, up to the first
 * 32 distinct names in the list"; "You can't preload skills that set `disable-model-invocation:
 * true`"; "If a listed skill is missing or disabled ... Claude Code skips it"; and § Frontmatter
 * reference (`tools`): "To preload Skills into context, use the `skills` field rather than listing
 * `Skill` here". The example is the docs' api-developer agent.
 */
import { describe, expect, test } from 'bun:test';
import { planPreloadedSkills } from '../../src/agents/context.ts';
import { readAgent } from '../../src/format/agent.ts';
import { file, loaded, plugin } from '../support/agent-files.ts';
import { catalog } from '../support/agent-context.ts';
import { agentWith } from '../support/launch.ts';
import { spec } from '../support/spec.ts';

const API_DEVELOPER = [
  'name: api-developer',
  'description: Implement API endpoints following team conventions',
  'skills:',
  '  - api-conventions',
  '  - error-handling-patterns',
].join('\n');

const names = (count: number): string[] => Array.from({ length: count }, (_, i) => `skill-${i}`);

spec('agents.frontmatter.skills', () => {
  test('the docs example reads to the two names, and each is preloaded', () => {
    const agent = loaded(readAgent(file(API_DEVELOPER), { source: 'project', path: 'a.md' }));
    expect(agent.definition.skills).toEqual(['api-conventions', 'error-handling-patterns']);
    const plan = planPreloadedSkills(
      agent.definition.skills,
      catalog(['api-conventions', 'error-handling-patterns']),
    );
    expect(plan).toEqual({ load: ['api-conventions', 'error-handling-patterns'], skipped: [] });
  });

  test('a plugin agent keeps `skills` (a supported field there)', () => {
    const agent = loaded(readAgent(file(API_DEVELOPER), plugin()));
    expect(agent.definition.skills).toEqual(['api-conventions', 'error-handling-patterns']);
    expect(agent.ignored).not.toContain('skills');
  });

  test('without the field nothing is preloaded', () => {
    expect(planPreloadedSkills(undefined, catalog(['api-conventions']))).toEqual({
      load: [],
      skipped: [],
    });
  });

  test('only the first 32 distinct names are preloaded; later names are skipped as beyond the limit', () => {
    const listed = names(35);
    const plan = planPreloadedSkills(listed, catalog(listed));
    expect(plan.load).toEqual(listed.slice(0, 32));
    expect(plan.skipped).toEqual(
      listed.slice(32).map((name) => ({ name, reason: 'beyond-limit' })),
    );
  });

  test('the limit counts distinct names: a repeated name does not use up a place', () => {
    const listed = [...names(31), 'skill-0', 'skill-0', 'last', 'one-too-many'];
    const plan = planPreloadedSkills(listed, catalog([...listed]));
    expect(plan.load).toEqual([...names(31), 'last']);
    expect(plan.skipped).toEqual([{ name: 'one-too-many', reason: 'beyond-limit' }]);
  });

  test('exactly 32 names are all preloaded', () => {
    const listed = names(32);
    expect(planPreloadedSkills(listed, catalog(listed)).load).toEqual(listed);
  });

  test('a skill that is missing or disabled is skipped and the others still load', () => {
    const plan = planPreloadedSkills(['gone', 'api-conventions'], catalog(['api-conventions']));
    expect(plan.load).toEqual(['api-conventions']);
    expect(plan.skipped).toEqual([{ name: 'gone', reason: 'missing' }]);
  });

  test('a skill with disable-model-invocation: true cannot be preloaded (the bundled /verify included)', () => {
    const plan = planPreloadedSkills(
      ['verify', 'api-conventions'],
      catalog(['api-conventions'], ['verify']),
    );
    expect(plan.load).toEqual(['api-conventions']);
    expect(plan.skipped).toEqual([{ name: 'verify', reason: 'not-model-invocable' }]);
  });

  test('`Skill` in `tools` is not how to preload: it is kept, raises no issue and preloads nothing', () => {
    const result = readAgentResult('tools: Read, Skill');
    expect(result.issues).toEqual([]);
    const agent = loaded(result);
    expect(agent.definition.tools).toEqual(['Read', 'Skill']);
    expect(planPreloadedSkills(agent.definition.skills, catalog(['Skill']))).toEqual({
      load: [],
      skipped: [],
    });
  });

  test('a comma-separated string reads like a list', () => {
    expect(agentWith('skills: a, b').definition.skills).toEqual(['a', 'b']);
  });
});

function readAgentResult(extra: string) {
  return readAgent(file(`name: helper\ndescription: Helps\n${extra}`), {
    source: 'project',
    path: 'a.md',
  });
}

describe('preloading, outside spec: choices the docs leave open', () => {
  test('the order of the skipped list follows the order of the field', () => {
    const plan = planPreloadedSkills(
      ['b-missing', 'a-hidden', 'ok'],
      catalog(['ok'], ['a-hidden']),
    );
    expect(plan.skipped.map((skip) => skip.name)).toEqual(['b-missing', 'a-hidden']);
  });

  test('a missing skill among the first 32 still takes its place', () => {
    const listed = ['gone', ...names(32)];
    const plan = planPreloadedSkills(listed, catalog(names(32)));
    expect(plan.load).toEqual(names(31));
    expect(plan.skipped).toEqual([
      { name: 'gone', reason: 'missing' },
      { name: 'skill-31', reason: 'beyond-limit' },
    ]);
  });

  test('a repeated name is read once and not reported', () => {
    const plan = planPreloadedSkills(['a', 'a'], catalog(['a']));
    expect(plan).toEqual({ load: ['a'], skipped: [] });
  });
});
