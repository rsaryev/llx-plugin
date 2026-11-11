import { parseFrontmatter } from './frontmatter.ts';
import { warning, type PluginIssue } from './issues.ts';
import { readInvocable } from './skill-fields.ts';
import { resolveSkillName } from './skill-name.ts';
import type { Skill, SkillLayout } from './skill-types.ts';

export interface SkillRead {
  readonly skill: Skill;
  readonly issues: readonly PluginIssue[];
}

/** `skills/review/SKILL.md` is in `skills/review`; a file at the root is in `.`. */
export function directoryOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut < 0 ? '.' : path.slice(0, cut);
}

/**
 * The command a frontmatter `name` gives a skill whose folder fixed its name, when it differs from
 * `command` (`Skill.declaredCommand`); a `name` the rules refuse gives none.
 */
function declaredCommandOf(
  layout: SkillLayout,
  declared: string | undefined,
  command: string,
): string | undefined {
  if (layout.fixedName !== true || declared === undefined) return undefined;
  const own = resolveSkillName({ origin: layout.origin, dirName: layout.dirName }, declared);
  return own.command === command ? undefined : own.command;
}

/**
 * Read one `SKILL.md`. Never throws and never refuses the file (skills.md: "If the YAML between
 * the markers doesn't parse, the skill still loads with no fields set"; an unknown field is
 * ignored "without reporting an error"). What the docs leave open is in spec/judgments.md: a YAML
 * error and a value of the wrong shape are warnings naming the file.
 *
 * The name and the command come from `resolveSkillName`; its issues are reported against the file
 * (an error means the skill is refused: a name Claude Code does not load).
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
  const resolved = resolveSkillName(layout, declaredName);
  issues.push(
    ...resolved.issues.map((found) => ({
      severity: found.severity,
      path,
      message: found.message,
    })),
  );
  const { name, command } = resolved;
  const { origin } = layout;
  const declaredCommand = declaredCommandOf(layout, declaredName, command);
  return {
    skill: {
      ...frontmatter,
      kind: 'skill',
      name,
      command,
      ...(declaredCommand === undefined ? {} : { declaredCommand }),
      path,
      dir: directoryOf(path),
      origin,
      body: parsed.body,
    },
    issues,
  };
}
