import type { LockedSurfaces } from './sources.ts';

/** Where a skill comes from, as far as `allowed-tools` pre-approval is concerned. */
export type PreapprovalSource =
  | 'user'
  | 'project'
  | 'addDir'
  | 'synced'
  | 'plugin'
  | 'managed'
  | 'bundled';

/** What the host knows about the skill that is about to run. */
export interface PreapprovalSkill {
  readonly source: PreapprovalSource;
  /** The skill's frontmatter declares `hooks`. */
  readonly declaresHooks: boolean;
  /** The skill runs in a subagent through `context: fork`. */
  readonly contextFork: boolean;
}

/**
 * Whose frontmatter hooks the lock stops, so whose pre-approval it takes: "a personal or project
 * skill" (settings-reference.md, `strictPluginOnlyCustomization.hooks`). The docs name no other
 * source, so a skill from an added directory or claude.ai keeps it (spec/judgments.md).
 */
const LOSES: { readonly [S in PreapprovalSource]: boolean } = {
  user: true,
  project: true,
  addDir: false,
  synced: false,
  plugin: false,
  managed: false,
  bundled: false,
};

/**
 * Whether the tools the skill's `allowed-tools` lists are pre-approved while it runs. Under the `hooks`
 * lock a personal or project skill that declares hooks loses it, unless it runs in a subagent through
 * `context: fork`; a skill that declares no hooks keeps it too (settings-reference.md,
 * `strictPluginOnlyCustomization.hooks`; skills.md, "When managed settings lock hooks to plugins").
 */
export const allowedToolsPreapproved = (locked: LockedSurfaces, skill: PreapprovalSkill): boolean =>
  !(locked.has('hooks') && LOSES[skill.source] && skill.declaresHooks && !skill.contextFork);
