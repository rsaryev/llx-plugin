import type { SkillOrigin, SkillOriginKind } from '../format/skill-types.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';

/**
 * The limits on the hooks a skill registers (hooks.md, "Limits on skill hooks"): per source of
 * skills and per session, at most 1,024 hooks and 16,384 characters of matchers, built up skill by
 * skill. Pure counting: whether a session keeps the totals, and registering and firing the hooks,
 * are the host's and the hooks engine's.
 */
export const SKILL_HOOK_LIMITS = { hooks: 1024, matcherChars: 16_384 } as const;

export interface HookUsage {
  readonly hooks: number;
  readonly matcherChars: number;
}

export const NO_HOOKS_YET: HookUsage = { hooks: 0, matcherChars: 0 };

/**
 * The hooks and matcher characters of one skill's `hooks`: "A matcher with several hooks under it
 * counts once for each hook". Judgment (spec/judgments.md): characters are code points, and a group
 * with no matcher adds none.
 */
export function countSkillHooks(hooks: HooksSettings): HookUsage {
  let count = 0;
  let chars = 0;
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      count += group.hooks.length;
      chars += Array.from(group.matcher ?? '').length * group.hooks.length;
    }
  }
  return { hooks: count, matcherChars: chars };
}

export interface HooksAdmission {
  readonly admitted: boolean;
  /** The source's totals after this skill: unchanged when it was refused. */
  readonly used: HookUsage;
}

/**
 * Whether a skill's hooks fit what its source already registered. A skill that does not fit
 * "registers none of its hooks", so the totals do not move and a later, smaller skill may still fit.
 */
export function admitSkillHooks(used: HookUsage, hooks: HooksSettings): HooksAdmission {
  const added = countSkillHooks(hooks);
  const next = {
    hooks: used.hooks + added.hooks,
    matcherChars: used.matcherChars + added.matcherChars,
  };
  const fits =
    next.hooks <= SKILL_HOOK_LIMITS.hooks && next.matcherChars <= SKILL_HOOK_LIMITS.matcherChars;
  return fits ? { admitted: true, used: next } : { admitted: false, used };
}

const SOURCES: { readonly [K in SkillOriginKind]: (origin: SkillOrigin) => string } = {
  plugin: (origin) => `plugin:${'plugin' in origin ? origin.plugin : ''}`,
  managed: () => 'managed',
  user: () => 'user',
  project: () => 'project',
  synced: () => 'synced',
};

/**
 * The source a skill counts under: the project, the personal folder, or one plugin. Judgment: the
 * docs name no limit for a skill synced from claude.ai, so it counts as a source of its own.
 */
export function hookSourceOf(origin: SkillOrigin): string {
  return SOURCES[origin.kind](origin);
}
