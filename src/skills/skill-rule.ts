import type { Command, Skill, SkillOriginKind } from '../format/skill-types.ts';

/**
 * Every name a skill goes by, for the `Skill(...)` rules that name it (skills.md, "Restrict
 * Claude's skill access", the table of what a deny rule blocks beyond the name you write). The rule
 * matcher itself is `rules/target/skill.ts`; it reads these names from `PreparedCall.skillNames`.
 * Only a deny rule sees the names beyond the invoked one ("Claude Code matches an allow rule only
 * against the skill's own name and the name in Claude's invocation"), so the host passes the list
 * to the matcher and the matcher decides who may read it.
 */

/** The namespace of skills synced from claude.ai (skills.md, "Names reserved for synced skills"). */
const SYNCED_NAMESPACE = 'anthropic-skills';
const QUALIFIER = ':';

type Named = Pick<Skill | Command, 'name' | 'command' | 'origin'>;

/** The names beyond `command` that one origin's skills go by. A registry over the origin union (K1). */
const OTHER_NAMES: { readonly [K in SkillOriginKind]: (skill: Named) => readonly string[] } = {
  // "An unqualified name: Skill(deploy) also blocks a nested skill listed as apps/web:deploy".
  // Judgment (spec/judgments.md): a plugin skill's own namespace is its plugin, so `Skill(deploy)`
  // does not reach `my-plugin:deploy`; only a nested folder's qualifier is dropped.
  managed: (skill) => unqualified(skill),
  user: (skill) => unqualified(skill),
  project: (skill) => unqualified(skill),
  plugin: () => [],
  // "A skill synced from claude.ai: Skill(anthropic-skills:deploy)" and "The plugin form of a synced
  // skill: Skill(deploy:deploy)", besides its short name.
  synced: (skill) => [
    skill.name,
    `${SYNCED_NAMESPACE}${QUALIFIER}${skill.name}`,
    `${skill.name}${QUALIFIER}${skill.name}`,
  ],
};

/** The frontmatter name of a skill whose command carries a folder qualifier (`apps/web:deploy`). */
function unqualified(skill: Named): readonly string[] {
  return skill.command.endsWith(`${QUALIFIER}${skill.name}`) && skill.command !== skill.name
    ? [skill.name]
    : [];
}

/**
 * The skill's command first, then every other name, then the aliases the host knows (a bundled
 * skill's alias, `/review` for `/code-review`: the kit holds no catalog of bundled skills). Each
 * name once, in that order.
 */
export function skillNamesOf(skill: Named, aliases: readonly string[] = []): readonly string[] {
  return [...new Set([skill.command, ...OTHER_NAMES[skill.origin.kind](skill), ...aliases])];
}
