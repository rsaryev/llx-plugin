/** Helpers for the tests of `readSkill` and the skill field readers. */
import { readSkill } from '../../src/format/skill.ts';
import type { SkillLayout } from '../../src/format/skill-types.ts';

export const PROJECT_LAYOUT: SkillLayout = { origin: { kind: 'project' }, dirName: 'my-skill' };

/** A `SKILL.md` made of frontmatter lines and a body. */
export const skillFile = (frontmatter: string, body = 'Do the work.'): string =>
  `---\n${frontmatter}\n---\n\n${body}\n`;

/** Read a project skill whose frontmatter is the given lines. */
export const readFields = (frontmatter: string, body?: string) =>
  readSkill('.claude/skills/my-skill/SKILL.md', skillFile(frontmatter, body), PROJECT_LAYOUT);

/** The messages of the issues, to look for a field's name in. */
export const messages = (issues: readonly { readonly message: string }[]): string[] =>
  issues.map((found) => found.message);
