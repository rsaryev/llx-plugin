import { isRecord } from './record.ts';

/**
 * What ExitPlanMode runs with (hooks.md, "ExitPlanMode"): `allowedPrompts` is "Deprecated. Claude
 * Code accepts the field but ignores it", so the effective input is the input without it. Anything
 * that is not an object has no fields (a judgment, spec/judgments.md).
 */
export function effectiveExitPlanModeInput(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  return Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'allowedPrompts'));
}
