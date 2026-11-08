import type { PermissionMode } from '../../src/protocol/official.ts';
import {
  resolveSubagentPermissionMode,
  type SubagentPermission,
} from '../../src/agents/subagent-permission.ts';
import type { PermissionModeInput } from '../../src/agents/permission-mode.ts';
import { baselineDecision, type ActionCategory } from '../../src/agents/permission-baseline.ts';

/** Every value `permissionMode` takes, copied by hand from the sub-agents.md table. */
export const DOC_INPUTS: readonly PermissionModeInput[] = [
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
  'manual',
];

export const resolve = (
  main: PermissionMode,
  set?: PermissionModeInput,
  autoAvailable = true,
): SubagentPermission => resolveSubagentPermissionMode({ main, set, autoAvailable });

const CATEGORIES: readonly ActionCategory[] = ['read', 'edit', 'filesystem-command', 'other'];

/** What `mode` decides for each category, in `CATEGORIES` order, for an in-scope action. */
export const row = (mode: PermissionMode, inScope = true) =>
  CATEGORIES.map((category) => baselineDecision(mode, { category, inScope }));
