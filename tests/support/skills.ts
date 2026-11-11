/** Helpers for the tests of invocation, listing, path gate and execution (the runtime reading a `Skill`). */
import { readSkill } from '../../src/format/skill.ts';
import { modelListing } from '../../src/skills/listing.ts';
import type { Skill, SkillOrigin } from '../../src/format/skill-types.ts';

export const PLUGIN: SkillOrigin = { kind: 'plugin', plugin: 'my-plugin' };
const PROJECT: SkillOrigin = { kind: 'project' };

export interface SkillSpec {
  /** The skill folder's name, and the default `name`. */
  readonly name?: string;
  readonly origin?: SkillOrigin;
  readonly body?: string;
}

/**
 * A skill read from a `SKILL.md` whose frontmatter is the given lines, through the real reader, so
 * a test exercises what the docs say a `SKILL.md` becomes. A skill with no `description` line gets
 * the first line of the body, as the docs say.
 */
export function skillWith(frontmatter = '', spec: SkillSpec = {}): Skill {
  const { name = 'deploy', origin = PROJECT, body = 'Deploy it.' } = spec;
  const text = `---\n${frontmatter}\n---\n\n${body}\n`;
  const folder = 'plugin' in origin ? `skills/${name}` : `.claude/skills/${name}`;
  return readSkill(`${folder}/SKILL.md`, text, { origin, dirName: name }).skill;
}

/** A skill with a frontmatter `name`, more frontmatter, and an optional body. */
export const named = (name: string, frontmatter = '', body?: string) =>
  skillWith(`name: ${name}\n${frontmatter}`, { name, ...(body === undefined ? {} : { body }) });
export const described = (name: string, description: string, extra = '') =>
  named(name, `description: ${JSON.stringify(description)}\n${extra}`);
export const listed = (
  skills: Parameters<typeof modelListing>[0],
  options?: Parameters<typeof modelListing>[1],
) => modelListing(skills, options).entries;
