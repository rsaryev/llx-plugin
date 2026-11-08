import type { Frontmatter } from '../../format/frontmatter.ts';

/** A skill as the host knows it when it expands the skill's text for Claude. */
export interface SkillSource {
  /** The skill's name: `e.skill`. */
  readonly name: string;
  /** Who provides it: `policySettings`, `userSettings`, `projectSettings`, or a word such as `plugin`, `mcp`, `syncedSkills`, `built-in`. */
  readonly source: string;
  /** The plugin's name, when the skill comes from a plugin. */
  readonly pluginName?: string;
  /** The absolute path of the skill's file; absent for a skill with no file on this machine. */
  readonly path?: string;
  /** The file's frontmatter, read by `parseFrontmatter`; absent for a skill with no file. */
  readonly frontmatter?: Frontmatter;
}

/** The sources whose skills belong to a plugin, so `e.pluginName` is set. */
const PLUGIN_SOURCES: ReadonlySet<string> = new Set(['plugin']);

export type SkillPromptEvent = {
  readonly skill: string;
  readonly text: string;
  readonly source: string;
  readonly pluginName?: string;
  readonly path?: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly frontmatterProblem?: string;
};

/**
 * The `skill.prompt` event for a skill (reference.md, "Source and frontmatter fields on
 * `skill.prompt`"). `frontmatter` holds the file's frontmatter as plain data, empty when the skill
 * has none; `frontmatterProblem` is the reason it is missing the frontmatter, and absent when
 * `frontmatter` holds the whole of it or there is none.
 */
export function skillPromptEvent(skill: SkillSource, text: string): SkillPromptEvent {
  const problem = skill.frontmatter?.problem;
  return {
    skill: skill.name,
    text,
    source: skill.source,
    ...(PLUGIN_SOURCES.has(skill.source) && skill.pluginName !== undefined
      ? { pluginName: skill.pluginName }
      : {}),
    ...(skill.path === undefined ? {} : { path: skill.path }),
    frontmatter: { ...skill.frontmatter?.fields },
    ...(problem === undefined ? {} : { frontmatterProblem: problem }),
  };
}
