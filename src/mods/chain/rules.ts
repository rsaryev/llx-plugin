import type { EventRules } from '../types.ts';

/** Rules that know no event: results and changed events pass through unchanged. */
export const NO_RULES: EventRules = {
  shapeProblem: () => undefined,
  changeProblem: () => undefined,
  coreInput: (_event, _original, passed) => passed,
  settle: (_event, result) => result,
};
