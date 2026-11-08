import type { Command, Skill } from '../format/skill-types.ts';
import { ORIGIN_TRAITS } from '../format/skill-types.ts';
import type { Settings } from '../protocol/official.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';

/**
 * Who may invoke a skill and what the model and the `/` menu are told about it (skills.md,
 * "Control who invokes a skill" and "Override skill visibility from settings"). Pure: the host
 * reads the settings and passes `skillOverrides` in.
 */

/** A skill or a command file: both carry the two frontmatter fields (skills.md, "Choose where skills load"). */
export type Invocable = Skill | Command;

/** `skillOverrides` as the SDK types it: skill name to one of four states. */
export type SkillOverrides = NonNullable<Settings['skillOverrides']>;
export type OverrideState = SkillOverrides[string];

/** The four states, in the order the docs list them. */
export const OVERRIDE_STATES = [
  'on',
  'name-only',
  'user-invocable-only',
  'off',
] as const satisfies readonly OverrideState[];

/** @public A compile-time drift guard: a state Anthropic adds fails the typecheck here. */
export type OverrideStatesMatchSdk = Assert<Equal<(typeof OVERRIDE_STATES)[number], OverrideState>>;

/** What the model is told about a skill: name and description, name only, or nothing. */
export type ModelListing = 'description' | 'name' | 'hidden';

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

/** What a `skillOverrides` state leaves visible: to the model, and to the user. */
const OVERRIDE_EXPOSURE: {
  readonly [S in OverrideState]: { readonly model: ModelListing; readonly user: boolean };
} = {
  on: { model: 'description', user: true },
  'name-only': { model: 'name', user: true },
  'user-invocable-only': { model: 'hidden', user: true },
  off: { model: 'hidden', user: false },
};

/** The state in force for a skill: absent from `skillOverrides` is `on`, and a plugin skill is never overridden. */
export function overrideState(skill: Invocable, overrides: SkillOverrides = {}): OverrideState {
  if (!ORIGIN_TRAITS[skill.origin.kind].honoursSkillOverrides) return 'on';
  return Object.hasOwn(overrides, skill.name) ? (overrides[skill.name] ?? 'on') : 'on';
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
  const exposure = OVERRIDE_EXPOSURE[overrideState(skill, overrides)];
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

/**
 * What the refused party is told. Judgment (spec/judgments.md): the docs say Claude "is told ... not
 * to reproduce the deploy steps another way", so it suggests `/deploy`, and that the `skillOverrides`
 * error is returned, but they quote neither text.
 */
const DENIAL_MESSAGE: { readonly [R in DenialReason]: (command: string) => string } = {
  'disable-model-invocation': (command) =>
    `/${command} sets disable-model-invocation: Claude cannot run it on its own. Ask the user to run /${command} themselves. Do not carry out its steps another way.`,
  'user-invocable-false': (command) =>
    `/${command} sets user-invocable: false: only Claude can invoke it, so typing /${command} does not run it.`,
  'skill-override': (command) =>
    `/${command} is hidden by the skillOverrides setting, so it is not run. Ask the user to change skillOverrides if it should run.`,
};

export type InvocationVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenialReason; readonly message: string };

/** Whether `by` may start `skill`, with the reason and the text to give back when not. */
export function checkInvocation(
  skill: Invocable,
  by: Invoker,
  overrides: SkillOverrides = {},
): InvocationVerdict {
  if (POLICY_ALLOWS[by](invocationPolicy(skill, overrides))) return { allowed: true };
  const reason = DENIAL_REASON[by](skill);
  return { allowed: false, reason, message: DENIAL_MESSAGE[reason](skill.command) };
}
