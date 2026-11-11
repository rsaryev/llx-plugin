import type { ExitReason } from './official.ts';
import type { Assert, Equal } from './type-equality.ts';

/**
 * Why a session ends (mods reference.md, "Session": `e.reason` of `session.end`; `/branch` reports
 * `resume`), tied to the official `ExitReason` union: an SDK update that adds or drops a reason
 * fails the typecheck here.
 */
export const SESSION_END_REASONS = [
  'clear',
  'resume',
  'logout',
  'prompt_input_exit',
  'other',
] as const satisfies readonly ExitReason[];

/** One of `SESSION_END_REASONS`: the `reason` of `session.end`. */
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** @public A compile-time drift guard: the typecheck fails when the SDK changes the union. */
export type SessionEndReasonsMatchSdk = Assert<
  Equal<(typeof SESSION_END_REASONS)[number], ExitReason>
>;
