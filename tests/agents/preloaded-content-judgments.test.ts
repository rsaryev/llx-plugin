/** Catalog lookup and side-effect-free planning choices; spec/judgments.md, not compatibility. */
import { expect, test } from 'bun:test';
import { preloadAgentSkills } from '../../src/agents/preloaded-content.ts';
import { readSkill } from '../../src/format/skill.ts';

test('an exact command is preferred to an earlier plugin bare-name alias', () => {
  const plugin = readSkill('skills/api/SKILL.md', 'Plugin body', {
    origin: { kind: 'plugin', plugin: 'p' },
    dirName: 'api',
  }).skill;
  const project = readSkill('skills/api/SKILL.md', 'Project body', {
    origin: { kind: 'project' },
    dirName: 'api',
  }).skill;
  expect(preloadAgentSkills({ skills: ['api'] }, [plugin, project]).preloaded).toEqual([project]);
});

test('the adapter returns unexpanded bodies without executing embedded shell instructions', () => {
  const body = 'Context: !`echo hello` ${CLAUDE_PLUGIN_ROOT}';
  const skill = readSkill('skills/api/SKILL.md', body, {
    origin: { kind: 'project' },
    dirName: 'api',
  }).skill;
  expect(preloadAgentSkills({ skills: ['api'] }, [skill]).preloaded[0]?.body).toBe(body);
});
