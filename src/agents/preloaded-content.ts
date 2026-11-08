import type { Skill, Command } from '../format/skill-types.ts';
import type { AgentDefinition } from '../protocol/official.ts';
import { planPreloadedSkills, type PreloadPlan } from './preload-skills.ts';

type AvailableSkill = Skill | Command;

/** Full parsed artifacts, not their discovery descriptions: the host can inject each `body`. */
export interface PreloadedSkills {
  readonly preloaded: readonly AvailableSkill[];
  readonly skipped: PreloadPlan['skipped'];
}

/**
 * sub-agents.md § Preload skills into subagents. The caller supplies the enabled catalog; the
 * plan still excludes model-disabled artifacts. No invocation, tool grant or inherited skill list
 * is created, and no shell command embedded in a body is run as a side effect.
 */
export function preloadAgentSkills(
  definition: Pick<AgentDefinition, 'skills'>,
  catalog: readonly AvailableSkill[],
): PreloadedSkills {
  // Judgment: an exact command wins over an earlier bare-name alias, as the host catalog does.
  const find = (name: string) =>
    catalog.find((skill) => skill.command === name) ?? catalog.find((skill) => skill.name === name);
  const plan = planPreloadedSkills(definition.skills, {
    has: (name) => find(name) !== undefined,
    isModelInvocable: (name) => find(name)?.disableModelInvocation === false,
  });
  return {
    preloaded: plan.load.flatMap((name) => {
      const skill = find(name);
      return skill ? [skill] : [];
    }),
    skipped: plan.skipped,
  };
}
