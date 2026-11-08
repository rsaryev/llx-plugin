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
 * Where a plugin came from, which the host knows and the kit cannot see. Both of the last two are
 * plugins the managed settings treat like the folders they sit in:
 * - `skills-directory`: declared with a `.claude-plugin` manifest inside `~/.claude/skills/` or
 *   `.claude/skills/` ("hooks from plugins other than skills-directory plugins" keep running; the
 *   `allowManagedPermissionRulesOnly` entry lists them among the sources whose `allowed-tools` are
 *   ignored).
 * - `inline-managed-session`: a plugin loaded for one session only (id ending in `@inline`) in a
 *   Desktop Code or Cowork session whose managed settings set `allowManagedPermissionRulesOnly`, on
 *   Claude Code 2.1.305 or later. The host decides all of those conditions. Any other `@inline`
 *   plugin is `installed`.
 */
export type SkillPluginSource = 'installed' | 'skills-directory' | 'inline-managed-session';

interface Keeps {
  /** The skill's frontmatter hooks register under the hooks lock. */
  readonly hooks: boolean;
  /** The skill's `allowed-tools` grant applies under `allowManagedPermissionRulesOnly`. */
  readonly grant: boolean;
}

const KEEPS_ALL: Keeps = { hooks: true, grant: true };
const KEEPS_NONE: Keeps = { hooks: false, grant: false };

const PLUGIN_KEEPS: { readonly [S in SkillPluginSource]: Keeps } = {
  installed: KEEPS_ALL,
  'skills-directory': KEEPS_NONE,
  'inline-managed-session': { hooks: true, grant: false },
};

/**
 * What each origin keeps. Under the hooks lock "a skill keeps its frontmatter hooks ... only if it's
 * a plugin skill, a bundled skill, or a skill in the managed settings directory" (the kit models
 * neither of the last two origins). With only managed permission rules, "Claude Code ignores
 * `allowed-tools` in project and personal skills and in the other sources the setting's entry
 * lists", and a synced skill's grant "doesn't apply". A plugin keeps what its source keeps.
 */
const KEEPS: { readonly [K in SkillOriginKind]: (source: SkillPluginSource) => Keeps } = {
  plugin: (source) => PLUGIN_KEEPS[source],
  user: () => KEEPS_NONE,
  project: () => KEEPS_NONE,
  synced: () => KEEPS_NONE,
};

type Source = Pick<Skill | Command, 'origin' | 'context'> & Pick<InvocableFrontmatter, 'hooks'>;

/** Whether the skill's frontmatter hooks register when it is invoked. */
export function hooksRegister(
  skill: Source,
  policy: ExpandPolicy | undefined,
  source: SkillPluginSource = 'installed',
): boolean {
  return policy?.hooksLockedToPlugins !== true || KEEPS[skill.origin.kind](source).hooks;
}

/**
 * Whether the skill's `allowed-tools` grant applies. A skill that declares hooks under the hooks
 * lock "loses its `allowed-tools` pre-approval", except that "when such a skill runs in a subagent
 * through `context: fork`, it keeps the pre-approval". The fork exception is the hooks lock's only;
 * `allowManagedPermissionRulesOnly` ignores the field in a forked skill too.
 */
export function grantApplies(
  skill: Source,
  policy: ExpandPolicy | undefined,
  source: SkillPluginSource = 'installed',
): boolean {
  if (policy?.managedPermissionRulesOnly === true && !KEEPS[skill.origin.kind](source).grant) {
    return false;
  }
  return (
    skill.hooks === undefined || skill.context === 'fork' || hooksRegister(skill, policy, source)
  );
}
