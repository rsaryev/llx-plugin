import { parseFrontmatter } from './frontmatter.ts';
import { warning, type PluginIssue } from './issues.ts';
import { readInvocable } from './skill-fields.ts';
import type { Skill, SkillLayout } from './skill-types.ts';

export interface SkillRead {
  readonly skill: Skill;
  readonly issues: readonly PluginIssue[];
}

/** `skills/review/SKILL.md` is in `skills/review`; a file at the root is in `.`. */
function directoryOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut < 0 ? '.' : path.slice(0, cut);
}

/**
 * Read one `SKILL.md`. Never throws and never refuses the file (skills.md: "If the YAML between
 * the markers doesn't parse, the skill still loads with no fields set"; an unknown field is
 * ignored "without reporting an error"). What the docs leave open is in spec/judgments.md: a YAML
 * error and a value of the wrong shape are warnings naming the file.
 *
 * The command name is the declared `name`, else the folder's name, behind the plugin's prefix for
 * a plugin skill. That is the minimum a skill needs to be named; the full rules of "How a skill
 * gets its command name" (no doubled prefix, the root `SKILL.md`, characters a name cannot hold)
 * are `resolveSkillName`'s.
 */
export function readSkill(path: string, text: string, layout: SkillLayout): SkillRead {
  const parsed = parseFrontmatter(text);
  const issues: PluginIssue[] = [];
  if (parsed.problem !== undefined) {
    const where = parsed.line === undefined ? '' : ` (line ${parsed.line})`;
    issues.push(
      warning(
        path,
        `frontmatter ${parsed.problem}${where}; the skill loads with its body and no fields set`,
      ),
    );
  }
  const { frontmatter, declaredName, problems } = readInvocable(parsed.fields, parsed.body);
  issues.push(...problems.map((found) => warning(path, `${found.key} ${found.reason}`)));
  const name = declaredName ?? layout.dirName;
  const { origin } = layout;
  const command = 'plugin' in origin ? `${origin.plugin}:${name}` : name;
  return {
    skill: {
      ...frontmatter,
      kind: 'skill',
      name,
      command,
      path,
      dir: directoryOf(path),
      origin,
      body: parsed.body,
    },
    issues,
  };
}
