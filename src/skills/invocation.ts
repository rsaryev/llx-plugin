import type { InvocableHead } from '../format/skill-types.ts';
import { exposureOf, type ModelListing, type SkillOverrides } from './visibility.ts';

/**
 * Who may invoke a skill and what the model and the `/` menu are told about it (skills.md,
 * "Control who invokes a skill" and "Override skill visibility from settings"). Pure: the host
 * reads the settings and passes `skillOverrides` in.
 */

/**
 * A skill or a command file: both carry the two frontmatter fields (skills.md, "Choose where skills
 * load"). The body is not needed to decide who may invoke it or how it is listed, so a skill read
 * without its body (`InvocableHead`) is as good as a whole one.
 */
export type Invocable = InvocableHead;

/**
 * Who starts a skill: the user typing `/name`, Claude through the Skill tool, a subagent's `skills`
 * list (preloading), a session-scoped scheduled task that fires with the skill as its prompt.
 */
export const INVOKERS = ['user', 'model', 'preload', 'scheduled-task'] as const;
export type Invoker = (typeof INVOKERS)[number];

export interface InvocationPolicy {
  /** Typing `/name` runs the skill. */
  readonly user: boolean;
  /** Claude may load the skill on its own through the Skill tool. */
  readonly model: boolean;
  /** What the skill listing the model reads shows of it. */
  readonly listedToModel: ModelListing;
  /** The skill is a row of the `/` menu. */
  readonly inMenu: boolean;
  /** A subagent's `skills` field may preload it. */
  readonly preloadable: boolean;
  /** A scheduled task may fire with it as the prompt. */
  readonly scheduledPrompt: boolean;
}

/**
 * The whole matrix for one skill: the frontmatter and the override together. "Description not in
 * context" for `disable-model-invocation: true`; a skill the model cannot invoke is also not
 * preloadable and not run by a scheduled fire, because those "draw from the same set of skills
 * Claude can invoke" (sub-agents.md).
 */
export function invocationPolicy(
  skill: Invocable,
  overrides: SkillOverrides = {},
): InvocationPolicy {
  const exposure = exposureOf(skill, overrides);
  const listedToModel = skill.disableModelInvocation ? 'hidden' : exposure.model;
  const model = listedToModel !== 'hidden';
  const user = skill.userInvocable && exposure.user;
  return {
    user,
    model,
    listedToModel,
    inMenu: user,
    preloadable: model,
    scheduledPrompt: model,
  };
}

const POLICY_ALLOWS: { readonly [I in Invoker]: (policy: InvocationPolicy) => boolean } = {
  user: (policy) => policy.user,
  model: (policy) => policy.model,
  preload: (policy) => policy.preloadable,
  'scheduled-task': (policy) => policy.scheduledPrompt,
};

export type DenialReason = 'disable-model-invocation' | 'user-invocable-false' | 'skill-override';

/** Why an invoker was refused: the field that is set, else the override. */
const DENIAL_REASON: { readonly [I in Invoker]: (skill: Invocable) => DenialReason } = {
  user: (skill) => (skill.userInvocable ? 'skill-override' : 'user-invocable-false'),
  model: (skill) => (skill.disableModelInvocation ? 'disable-model-invocation' : 'skill-override'),
  preload: (skill) =>
    skill.disableModelInvocation ? 'disable-model-invocation' : 'skill-override',
  'scheduled-task': (skill) =>
    skill.disableModelInvocation ? 'disable-model-invocation' : 'skill-override',
};

/** Why the skill is withheld, as a clause: used in the texts of the invokers that are not the model. */
const DENIAL_CLAUSE: { readonly [R in DenialReason]: string } = {
  'disable-model-invocation': 'it sets disable-model-invocation, so Claude cannot invoke it',
  'user-invocable-false': 'it sets user-invocable: false',
  'skill-override': 'the skillOverrides setting hides it from Claude',
};

/**
 * What the refused party is told. Judgment (spec/judgments.md): the docs say Claude "is told ... not
 * to reproduce the deploy steps another way", so it suggests `/deploy`, and that the `skillOverrides`
 * error is returned, but they quote neither text. A scheduled fire withheld from a skill "reaches
 * Claude as plain text instead of executing" (scheduled-tasks.md), so its text says that; a preload
 * is simply not injected.
 */
const DENIAL_MESSAGE: {
  readonly [I in Invoker]: (command: string, reason: DenialReason) => string;
} = {
  user: (command, reason) =>
    reason === 'user-invocable-false'
      ? `/${command} sets user-invocable: false: only Claude can invoke it, so typing /${command} does not run it.`
      : `/${command} is hidden by the skillOverrides setting, so it is not run. Ask the user to change skillOverrides if it should run.`,
  model: (command, reason) =>
    reason === 'skill-override'
      ? `/${command} is hidden by the skillOverrides setting, so it is not run. Ask the user to change skillOverrides if it should run.`
      : `/${command} sets disable-model-invocation: Claude cannot run it on its own. Ask the user to run /${command} themselves. Do not carry out its steps another way.`,
  preload: (command, reason) =>
    `/${command} is not preloaded into the subagent: ${DENIAL_CLAUSE[reason]}.`,
  'scheduled-task': (command, reason) =>
    `/${command} is not run by the scheduled task: ${DENIAL_CLAUSE[reason]}. The prompt reaches Claude as plain text instead of executing.`,
};

export type InvocationVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason; readonly message: string };

export interface InvocationOptions {
  /**
   * The user's message names the skill after plain text (`go ahead and /deploy`, see
   * `readSkillMentions`): "The name counts as your permission for that message". Judgment
   * (spec/judgments.md): it lifts `disable-model-invocation` for the model's invocation in that
   * message only, never a `skillOverrides` state, and never a preload or a scheduled fire.
   */
  readonly permittedByMention?: boolean;
}

/** Whether `by` may start `skill`, with the reason and the text to give back when not. */
export function checkInvocation(
  skill: Invocable,
  by: Invoker,
  overrides: SkillOverrides = {},
  options: InvocationOptions = {},
): InvocationVerdict {
  if (POLICY_ALLOWS[by](invocationPolicy(skill, overrides))) return { allowed: true };
  if (by === 'model' && options.permittedByMention === true && skill.disableModelInvocation) {
    const withoutFlag = { ...skill, disableModelInvocation: false };
    if (invocationPolicy(withoutFlag, overrides).model) return { allowed: true };
  }
  const reason = DENIAL_REASON[by](skill);
  return { allowed: false, reason, message: DENIAL_MESSAGE[by](skill.command, reason) };
}
