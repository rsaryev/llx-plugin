import type { SessionSkill } from './session-skill-catalog.ts';
import type { SkillSource } from './session-skill-entries.ts';
import type { ScanScope } from '../skills/index.ts';

/**
 * What a host reads off a `SessionSkill` row for its own list: the plugin it belongs to, the scope
 * it loaded from, and the frontmatter `keywords` some skills carry. Pure readers of the row.
 */

/** A plugin skill's plugin: the id the host uses for it and the name its commands are scoped by. */
export interface SkillPlugin {
  readonly id: string;
  readonly name: string;
}

/** The plugin a skill or command row belongs to; `undefined` for a folder or host skill. */
export function skillPlugin(skill: SessionSkill): SkillPlugin | undefined {
  const { source } = skill;
  const { origin } = skill.invocable;
  return 'pluginId' in source && 'plugin' in origin
    ? { id: source.pluginId, name: origin.plugin }
    : undefined;
}

/** Where a row loaded from: a folder scope (skills.md, "Choose where skills load"), `plugin`, or `host`. */
export type SkillScope = ScanScope | Exclude<SkillSource['kind'], 'folder'>;

export const skillScope = (skill: SessionSkill): SkillScope =>
  'scope' in skill.source ? skill.source.scope : skill.source.kind;

/**
 * The frontmatter `keywords` of a row: a YAML list keeps its strings, a string is split at commas;
 * anything else is none. `keywords` is no field of the skills frontmatter table, and "Claude Code
 * ignores a field it doesn't recognize without reporting an error" (skills.md, "Frontmatter
 * reference"): it changes nothing the kit or Claude Code does with the skill. Judgment
 * (spec/judgments.md, `skillKeywords`): the reader is a host's own use of a key it keeps.
 */
export function skillKeywords(skill: SessionSkill): readonly string[] {
  const value = skill.invocable.frontmatter['keywords'];
  const items: readonly unknown[] = typeof value === 'string' ? value.split(',') : [value].flat();
  return items.flatMap((item) =>
    typeof item === 'string' && item.trim() !== '' ? [item.trim()] : [],
  );
}
