import type { Context } from './context.ts';
import { NESTING_EXEMPT } from './context.ts';
import { drain, type Downstream } from './downstream.ts';
import { refused, returnedNothing, wrongShape, type Failure } from './failure.ts';
import type { Outcome } from './guarded.ts';
import type { Slot } from './link-trace.ts';
import { nestingProblem } from './nesting.ts';
import type { ChainEntry } from './registry.ts';

/** A hook of the chain where it is about to run, with what it needs. */
export interface Site {
  readonly ctx: Context;
  readonly entry: ChainEntry;
  readonly index: number;
  readonly e: unknown;
  readonly downstream: Downstream;
  /** Where this link fills its `next.trace` entry for the hook above. */
  readonly slot: Slot;
}

/** Whether `value` is what the hook's `next` gave it, unchanged: the hooks after it already judged it. */
export const passedOn = (site: Site, value: unknown): boolean => {
  const ended = site.downstream.latest()?.ended();
  return ended !== undefined && Object.is(ended.value, value);
};

/**
 * Why a hook's result is refused: nested too deep, or the wrong shape for the event. A result the
 * hook passed on unchanged from `next` is not judged again: it was judged where it was made, and a
 * hook that only observes never fails for what a later hook answered.
 */
function resultFailure(site: Site, value: unknown): Failure | undefined {
  const { ctx, entry } = site;
  if (passedOn(site, value)) return undefined;
  if (value === undefined) return returnedNothing();
  const exempt = NESTING_EXEMPT.has(ctx.name) || entry.hook.isGenerator;
  const tooDeep = exempt ? null : nestingProblem(value);
  if (tooDeep !== null) return refused(tooDeep);
  const answered = site.downstream.latest() !== undefined;
  const shape = ctx.rule.shapeProblem?.(value, answered, ctx.input);
  return shape === undefined ? undefined : wrongShape(shape);
}

/** The outcome of a hook that returned `value`: refused when it does not fit, else the value as it counts. */
export function judged(site: Site, value: unknown): Outcome {
  const failed = resultFailure(site, value);
  if (failed !== undefined) return { failed };
  const { rule } = site.ctx;
  const settled = rule.settle ? rule.settle(value) : value;
  site.ctx.options.observeResult?.(settled);
  return { value: settled };
}

/**
 * What a hook's result counts as: a streaming hook that returns nothing lets its last `next(e)`'s
 * result stand (claude-code/index.d.ts:13444, `StreamHookBody`), read to its end without its
 * remaining chunks, which the hook did not pass on. Anything else counts as returned.
 */
export async function standing(site: Site, value: unknown): Promise<unknown> {
  const latest = site.downstream.latest();
  if (value !== undefined || !site.entry.hook.isGenerator || latest === undefined) return value;
  return drain(latest);
}
