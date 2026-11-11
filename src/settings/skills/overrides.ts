import { SKILL_OVERRIDE_STATES } from '../../protocol/settings-keys.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';

/** One of the four values of a `skillOverrides` entry. */
export type SkillOverrideState = (typeof SKILL_OVERRIDE_STATES)[number];

/**
 * What a state does to one skill (skills.md, "Override skill visibility from settings": the table
 * of "Listed to Claude" and "In `/` menu"). `inClientCommandLists` is the command list advertised
 * to Remote Control clients and Agent SDK callers; `invokableByFullName` is false when invoking the
 * skill by its full name returns the `skillOverrides` error (`blockedBy`) instead of running it.
 */
export interface SkillVisibility {
  readonly listedToModel: 'full' | 'nameOnly' | 'hidden';
  readonly inSlashMenu: boolean;
  readonly inClientCommandLists: boolean;
  readonly invokableByFullName: boolean;
  readonly blockedBy: 'skillOverrides' | undefined;
}

/** What the host knows about the skill it asks for. */
export interface SkillSubject {
  /** A skill a plugin provides: "Overrides don't apply to plugin skills". */
  readonly plugin?: boolean;
  /** The other names of a bundled skill, such as `checkup` for `/doctor`. */
  readonly aliases?: readonly string[];
}

const SHOWN = {
  listedToModel: 'full',
  inSlashMenu: true,
  inClientCommandLists: true,
  invokableByFullName: true,
  blockedBy: undefined,
} as const satisfies SkillVisibility;

/** One row per state; a registry typed over the union, so a fifth state cannot be forgotten. */
const VISIBILITY: { readonly [S in SkillOverrideState]: SkillVisibility } = {
  on: SHOWN,
  'name-only': { ...SHOWN, listedToModel: 'nameOnly' },
  'user-invocable-only': { ...SHOWN, listedToModel: 'hidden' },
  // `off` hides the skill from the terminal `/` menu "and" from the Remote Control and SDK lists.
  off: {
    listedToModel: 'hidden',
    inSlashMenu: false,
    inClientCommandLists: false,
    invokableByFullName: false,
    blockedBy: 'skillOverrides',
  },
};

/** Files whose entries under a bundled skill's alias apply (settings-reference.md, `skillOverrides`). */
const ALIAS_SCOPES: readonly PolicyScope[] = ['managed', 'flag'];

/** Position in the order the docs list the states: later hides more. */
const strictness = (state: SkillOverrideState): number => SKILL_OVERRIDE_STATES.indexOf(state);

const strictest = (states: readonly SkillOverrideState[]): SkillOverrideState =>
  states.reduce((a, b) => (strictness(b) > strictness(a) ? b : a), 'on');

const entryOf = (
  entries: Readonly<Record<string, SkillOverrideState>>,
  name: string,
): SkillOverrideState | undefined => (Object.hasOwn(entries, name) ? entries[name] : undefined);

/**
 * The state of a skill after the files combine. Per name the highest file that sets it decides
 * (judgment, spec/judgments.md). Entries under an alias count only from managed settings and
 * `--settings` files; they can only restrict further, and an entry under the skill's own name in
 * managed settings beats them (skills.md).
 */
function stateOf(view: PolicyView, name: string, aliases: readonly string[]): SkillOverrideState {
  const holders = view.eachFromHighest('skillOverrides');
  const own = holders.flatMap((holder) => entryOf(holder.value, name) ?? []);
  const managedOwn = holders.some(
    (holder) => holder.scope === 'managed' && entryOf(holder.value, name) !== undefined,
  );
  if (managedOwn) return own[0] ?? 'on';
  const viaAliases = aliases.flatMap((alias) =>
    holders
      .filter((holder) => ALIAS_SCOPES.includes(holder.scope))
      .flatMap((holder) => entryOf(holder.value, alias) ?? [])
      .slice(0, 1),
  );
  return strictest([own[0] ?? 'on', ...viaAliases]);
}

/** What `skillOverrides` does to one skill; a plugin skill and a skill with no entry are `on`. */
export function skillVisibility(
  view: PolicyView,
  name: string,
  subject: SkillSubject = {},
): SkillVisibility {
  if (subject.plugin === true) return VISIBILITY.on;
  return VISIBILITY[stateOf(view, name, subject.aliases ?? [])];
}
