import type { InvocableFrontmatter, SkillOriginKind } from '../format/skill-types.ts';
import type { Command, Skill } from '../format/skill-types.ts';

/**
 * The managed settings that take a skill's `allowed-tools` or `hooks` away (skills.md, "When
 * managed settings lock hooks to plugins" and "When only managed permission rules apply"). The host
 * reads the settings; the kit decides what each does to one skill.
 */
export interface ExpandPolicy {
  /** `strictPluginOnlyCustomization` lists `hooks`. */
  readonly hooksLockedToPlugins?: boolean;
  /** `allowManagedPermissionRulesOnly` is set. */
  readonly managedPermissionRulesOnly?: boolean;
}

/**
 * Under the hooks lock only a plugin skill keeps its frontmatter hooks ("a skill keeps its
 * frontmatter hooks under that lock only if it's a plugin skill, a bundled skill, or a skill in the
 * managed settings directory"; the kit models neither of the last two origins).
 */
const KEEPS_HOOKS_UNDER_LOCK: { readonly [K in SkillOriginKind]: boolean } = {
  plugin: true,
  user: false,
  project: false,
  synced: false,
};

/**
 * With only managed permission rules, "Claude Code ignores `allowed-tools` in project and personal
 * skills and in the other sources the setting's entry lists", and a synced skill's grant "doesn't
 * apply". Judgment (spec/judgments.md): the entry lists no plugin source in the pulled docs, so a
 * plugin skill keeps its grant.
 */
const KEEPS_GRANT_UNDER_MANAGED_RULES: { readonly [K in SkillOriginKind]: boolean } = {
  plugin: true,
  user: false,
  project: false,
  synced: false,
};

type Source = Pick<Skill | Command, 'origin'> & Pick<InvocableFrontmatter, 'hooks'>;

/** Whether the skill's frontmatter hooks register when it is invoked. */
export function hooksRegister(skill: Source, policy: ExpandPolicy | undefined): boolean {
  return policy?.hooksLockedToPlugins !== true || KEEPS_HOOKS_UNDER_LOCK[skill.origin.kind];
}

/**
 * Whether the skill's `allowed-tools` grant applies. A skill that declares hooks under the hooks
 * lock "loses its `allowed-tools` pre-approval".
 */
export function grantApplies(skill: Source, policy: ExpandPolicy | undefined): boolean {
  const kind = skill.origin.kind;
  if (policy?.managedPermissionRulesOnly === true && !KEEPS_GRANT_UNDER_MANAGED_RULES[kind]) {
    return false;
  }
  return skill.hooks === undefined || hooksRegister(skill, policy);
}
