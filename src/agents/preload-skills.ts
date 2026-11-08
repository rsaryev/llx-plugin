/**
 * The skills a subagent preloads into its context at startup (sub-agents.md, "Preload skills into
 * subagents"). The kit plans; loading skill content and building the system prompt are the host's.
 */

/** sub-agents.md, "Preload skills into subagents": "up to the first 32 distinct names". */
const PRELOAD_LIMIT = 32;

/** What the host knows about its skills; narrow so the skills package need not be imported. */
export interface SkillCatalog {
  /** The skill exists and is enabled (a missing one and one the organization disabled are alike). */
  has(name: string): boolean;
  /** Claude can invoke it: not `disable-model-invocation: true` ("the same set of skills"). */
  isModelInvocable(name: string): boolean;
}

export type SkillSkipReason = 'missing' | 'not-model-invocable' | 'beyond-limit';

export interface PreloadPlan {
  /** The skills whose full content is injected at startup, in the list's order. */
  readonly load: readonly string[];
  /** Listed skills that are not injected; Claude Code "skips it and logs a warning". */
  readonly skipped: readonly { readonly name: string; readonly reason: SkillSkipReason }[];
}

/**
 * The skills a subagent preloads from its `skills` field. Only the first 32 distinct names count:
 * a name past them is skipped, and so is a listed name that is missing or not model-invocable (that
 * one still uses up its place among the 32, as the docs count names "in the list"). A repeated name
 * is read once and not reported (judgment). Which skills the subagent may invoke through the Skill
 * tool is the `tools` field's, not this one's.
 */
export function planPreloadedSkills(
  names: readonly string[] | undefined,
  catalog: SkillCatalog,
): PreloadPlan {
  const distinct = [...new Set(names ?? [])];
  const load: string[] = [];
  const skipped: { name: string; reason: SkillSkipReason }[] = [];
  distinct.forEach((name, index) => {
    if (index >= PRELOAD_LIMIT) skipped.push({ name, reason: 'beyond-limit' });
    else if (!catalog.has(name)) skipped.push({ name, reason: 'missing' });
    else if (!catalog.isModelInvocable(name)) skipped.push({ name, reason: 'not-model-invocable' });
    else load.push(name);
  });
  return { load, skipped };
}
