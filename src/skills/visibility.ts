import type { Command, Skill } from '../format/skill-types.ts';
import { ORIGIN_TRAITS } from '../format/skill-types.ts';
import type { Settings } from '../protocol/official.ts';
import type { Assert, Equal } from '../protocol/type-equality.ts';

/**
 * The `skillOverrides` setting (skills.md, "Override skill visibility from settings"): each key is
 * a skill name and each value one of four states that decides who is told about the skill. Pure:
 * the host reads the settings and passes the map in. The invocation policy (`invocation.ts`), the
 * model listing and the `/` menu (`listing.ts`) all read the states through this one registry.
 */

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

/** What one state leaves visible: "Listed to Claude" and "In `/` menu" of the docs table. */
export interface Exposure {
  readonly model: ModelListing;
  readonly user: boolean;
}

/** The docs table, a row per state: the registry the policy, the listing and the menu read. */
export const OVERRIDE_EXPOSURE: { readonly [S in OverrideState]: Exposure } = {
  on: { model: 'description', user: true },
  'name-only': { model: 'name', user: true },
  'user-invocable-only': { model: 'hidden', user: true },
  off: { model: 'hidden', user: false },
};

type Overridable = Pick<Skill | Command, 'name' | 'origin'>;

/** The state in force for a skill: absent from `skillOverrides` is `on`, and a plugin skill is never overridden. */
export function overrideState(skill: Overridable, overrides: SkillOverrides = {}): OverrideState {
  if (!ORIGIN_TRAITS[skill.origin.kind].honoursSkillOverrides) return 'on';
  return Object.hasOwn(overrides, skill.name) ? (overrides[skill.name] ?? 'on') : 'on';
}

/** What the skill's state leaves visible to Claude and to the user. */
export const exposureOf = (skill: Overridable, overrides: SkillOverrides = {}): Exposure =>
  OVERRIDE_EXPOSURE[overrideState(skill, overrides)];

/** What the `/skills` menu shows for a state: "The `/skills` menu labels the `user-invocable-only` state `user-only`". */
const MENU_LABELS: { readonly [S in OverrideState]: string } = {
  on: 'on',
  'name-only': 'name-only',
  'user-invocable-only': 'user-only',
  off: 'off',
};

export const overrideMenuLabel = (state: OverrideState): string => MENU_LABELS[state];
