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

/**
 * What the chain decided for one link, as `next.trace` names it (claude-code/index.d.ts:14851,
 * `TraceOutcome`): `returned` its result stood; `passed` it returned what its last `next()` resolved
 * to; `skipped` it failed before `next`, or a `next.to` above went beneath its tier; `kept` it failed
 * after `next` and that run's result stands; `expired` its time ran out; `caught` its `.catch`
 * handler's result stands; `rejected` the link rejected.
 */
export type TraceOutcome =
  | 'caught'
  | 'expired'
  | 'kept'
  | 'passed'
  | 'rejected'
  | 'returned'
  | 'skipped';

/** One settled run of a link beneath a hook, as `next.trace` lists it (claude-code/index.d.ts:14799). */
export interface TraceEntry {
  /** The link's place in the chain, 0 the outermost; the engine's is the chain's length. */
  readonly index: number;
  /** The mod, or `engine` for Claude Code's own behaviour. */
  readonly plugin: string;
  readonly tier: ModTier;
  readonly event: string;
  readonly outcome: TraceOutcome;
  /** `bypassed by <plugin>` on a link a `next.to` above went beneath; absent on one that ran. */
  readonly reason?: string;
  /** Its own time in milliseconds, the time its `next()` calls were in flight taken out. */
  readonly ms: number;
  /** On a streaming event, how many chunks the link yielded up. */
  readonly chunks?: number;
  readonly received: unknown;
  /** What the link settled on; undefined when it was skipped or rejected. */
  readonly returned: unknown;
}
