/** Helpers for the tests of a skill's `${CLAUDE_*}` variables. */
import { readSkill } from '../../src/format/skill.ts';
import type { Skill, SkillOrigin } from '../../src/format/skill-types.ts';
import {
  buildVariables,
  substituteVariables,
  type SkillSession,
  type VariableSource,
} from '../../src/skills/variables.ts';
import { fakeEnvironment, locations } from './ports.ts';

export const PLUGIN: SkillOrigin = { kind: 'plugin', plugin: 'my-plugin' };
export const ORIGINS: readonly SkillOrigin[] = [PLUGIN, { kind: 'user' }, { kind: 'project' }];

/** The `render-chart` skill of the docs, read from a `SKILL.md` of the given origin. */
export const skillOf = (origin: SkillOrigin, frontmatter = '', body = 'Do it.'): Skill => {
  const folder = 'plugin' in origin ? 'skills/render-chart' : '.claude/skills/render-chart';
  const text = `---\nname: render-chart\ndescription: Render a chart\n${frontmatter}---\n\n${body}\n`;
  return readSkill(`${folder}/SKILL.md`, text, { origin, dirName: 'render-chart' }).skill;
};

export const SESSION: SkillSession = { sessionId: 'sess-42', effort: 'high' };

/** Substitute `text` as the text of `skill`, with the fake ports. */
export async function expand(
  skill: VariableSource,
  text: string,
  session: Partial<SkillSession> = {},
): Promise<string> {
  const ports = { locations: locations(), environment: fakeEnvironment() };
  const vars = buildVariables(skill, { ...SESSION, ...session }, ports);
  return (await substituteVariables(text, vars)).text;
}
