import type { EffortLevel } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * The named reasoning-effort levels, lowest first (skills and agents `effort` frontmatter, the
 * `effortLevel` setting, `CLAUDE_CODE_EFFORT_LEVEL`). Asserted equal to the SDK's `EffortLevel`:
 * a level Anthropic adds fails the typecheck here.
 */
export const EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly EffortLevel[];

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type EffortLevelsMatchSdk = Assert<Equal<(typeof EFFORT_LEVELS)[number], EffortLevel>>;
