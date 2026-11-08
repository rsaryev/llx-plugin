import type { PreToolUseHookOutcome } from '../../rules/index.ts';
import type { HookOutcome } from '../outcome.ts';

/**
 * What the permission check (`decide`) reads of the `PreToolUse` hooks: their merged
 * `permissionDecision`, whether a hook exited with code 2 ("stops the tool call before permission
 * rules are evaluated"), and whether the answer carries `updatedInput`, which `AskUserQuestion` and
 * `ExitPlanMode` need beside an `allow` (hooks.md, "Tools that require user interaction").
 */
export function preToolUseHookOutcome(
  outcome: Pick<HookOutcome<'PreToolUse'>, 'block' | 'effects'>,
): PreToolUseHookOutcome {
  const { permissionDecision, updatedInput } = outcome.effects;
  return {
    ...(permissionDecision === undefined ? {} : { decision: permissionDecision }),
    ...(outcome.block?.via === 'exit2' ? { blocked: true } : {}),
    ...(updatedInput === undefined ? {} : { hasUpdatedInput: true }),
  };
}
