import { approvalMemory, type ApprovalMemory } from '../rules/index.ts';
import { settingsLocations, type SettingsLocationsInput } from '../settings/index.ts';
import type { PermissionsPolicy } from '../settings/index.ts';

/** What "Yes, and don't ask again" does for one tool in a session, and where it is saved. */
export interface SavedApproval {
  readonly memory: ApprovalMemory;
  /**
   * The file the rule is saved to, for an approval that lasts permanently: "`.claude/settings.local.json`
   * at the root of the git repository, resolved through worktrees to the main checkout", or the
   * working directory's where Claude Code does not use the root (permissions.md, "Permission system").
   * Absent when nothing is saved.
   */
  readonly ruleFile?: string;
}

/**
 * The effect of "Yes, and don't ask again" for `toolName` under the policy (`allowManagedPermissionRulesOnly`
 * stops saving new rules) and the host's paths; `undefined` for a tool the table does not list.
 */
export function savedApproval(
  toolName: string,
  policy: Pick<PermissionsPolicy, 'managedRulesOnly'>,
  locations: SettingsLocationsInput,
): SavedApproval | undefined {
  const memory = approvalMemory(toolName, { rulesLocked: policy.managedRulesOnly });
  if (memory === undefined) return undefined;
  return memory.lifetime === 'repository'
    ? { memory, ruleFile: settingsLocations(locations).local }
    : { memory };
}
