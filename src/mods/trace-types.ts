import type { ModTier } from '../protocol/mods-events.ts';

/** What one hook of a dispatch did, as `DispatchOptions.trace` reports it. */
export interface HookStep {
  /** The hook's place in `DispatchTrace.chain`; Claude Code's own behaviour comes after the last (`chain.length`). */
  readonly index: number;
  /** The mod, or `engine` for Claude Code's own behaviour. */
  readonly plugin: string;
  readonly tier: ModTier;
  readonly event: string;
  /** `passed` when the hook answered with exactly what `next` gave it, `returned` otherwise. */
  readonly outcome: 'passed' | 'returned';
  /** From the hook's start to its answer, `next` included, in milliseconds. */
  readonly ms: number;
  readonly received: unknown;
  readonly returned: unknown;
}

/** The hooks that handle an event, and the steps they took, in chain order (a function hook that ran to an answer is a step; a generator hook, or one that failed, is not). */
export interface DispatchTrace {
  /** The mods that have a hook for the event, in the order they run, once for each hook, before any matcher is tested. */
  readonly chain: readonly string[];
  readonly steps: readonly HookStep[];
}
