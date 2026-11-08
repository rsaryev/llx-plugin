import type { Budget } from '../../foundation/index.ts';
import { deepFreeze } from '../../foundation/index.ts';
import type { HookFailure, HookOrigin, ModTier } from '../../protocol/mods-events.ts';
import type { ModCatchNext, ModNext, SkipTier } from '../types.ts';
import { drain, finish, type Downstream, type Stream, type Tracked } from './downstream.ts';
import { nestingProblem } from './nesting.ts';
import { skipProblem } from './tiers.ts';

/** What `next(e)` gives a hook: a promise for a function hook, a stream for a generator hook. */
export type Output = Promise<unknown> | Stream;

/** What a `next` is built from: where the hook stands in the chain, and what follows it. */
export interface NextParts {
  readonly signal: AbortSignal;
  readonly origin: HookOrigin;
  readonly budget: Budget;
  readonly isGenerator: boolean;
  /** The tier of the mod whose hook this is. */
  readonly tier: ModTier;
  /** Runs the chain from the first hook at `index`, then Claude Code's own behaviour. */
  readonly runAt: (index: number, e: unknown) => Stream;
  /** The index of the hook after this one. */
  readonly after: number;
  /** Where a tier starts in the chain. */
  readonly tierStart: (tier: SkipTier) => number;
  /** Why the event this hook passes to `next` is refused, besides nesting. */
  readonly changeProblem: (e: unknown) => string | undefined;
  readonly downstream: Downstream;
}

/** A stream whose first pull rejects: how `next` refuses a call from a hook that is pulling a stream. */
async function* failing(message: string): Stream {
  yield* []; // a generator with a body of its own, so the refusal arrives on the first pull
  throw new Error(message);
}

/** A stream the hook pulls from, which stops the hook's time budget while it waits (time inside `next` is not the hook's own). */
async function* metered(stream: Stream, budget: Budget): Stream {
  for (;;) {
    budget.pause();
    const step = await stream.next().finally(() => budget.resume());
    if (step.done) return step.value;
    yield step.value;
  }
}

/** Runs `work` with the budget stopped: stopped first, so the hooks that `work` starts see the floor taken. */
async function paused<T>(budget: Budget, work: () => Promise<T>): Promise<T> {
  budget.pause();
  return work().finally(() => budget.resume());
}

/** The view of a budget a hook sees: `ms` is the whole limit and `remainingMs` what is left now. */
const budgetView = (budget: Budget): { readonly ms: number; readonly remainingMs: number } => ({
  ms: budget.ms,
  get remainingMs() {
    return budget.remainingMs();
  },
});

function outputOf(parts: NextParts, run: Tracked, replay: boolean): Output {
  if (parts.isGenerator) return metered(replay ? finish(run) : run.stream, parts.budget);
  return paused(parts.budget, () => drain(run));
}

function refuse(parts: NextParts, message: string): Output {
  return parts.isGenerator ? failing(message) : Promise.reject(new Error(message));
}

/** The message when the event a function hook passes to `next` nests too deep (a generator hook is exempt). */
const nestingOf = (parts: NextParts, e: unknown): string | undefined =>
  (parts.isGenerator ? null : nestingProblem(e)) ?? undefined;

/** Why `next` refuses the event: nested too deep, or a change the event does not allow. */
const refusalOf = (parts: NextParts, e: unknown): string | undefined =>
  nestingOf(parts, e) ?? parts.changeProblem(e);

function nextCall(parts: NextParts, replay: Tracked | undefined): (e: unknown) => Output {
  return (e) => {
    if (replay) return outputOf(parts, replay, true);
    const problem = refusalOf(parts, e);
    if (problem !== undefined) return refuse(parts, `next argument: ${problem}`);
    return outputOf(parts, parts.downstream.start(parts.runAt(parts.after, deepFreeze(e))), false);
  };
}

function skipCall(parts: NextParts): (e: unknown, tier: SkipTier) => Output {
  return (e, tier) => {
    const problem = skipProblem(parts.tier, tier) ?? refusalOf(parts, e);
    if (problem !== undefined) return refuse(parts, problem);
    const run = parts.runAt(parts.tierStart(tier), deepFreeze(e));
    return outputOf(parts, parts.downstream.start(run), false);
  };
}

function base(parts: NextParts, call: (e: unknown) => Output) {
  return Object.assign(call, {
    signal: parts.signal,
    origin: parts.origin,
    budget: budgetView(parts.budget),
    to: skipCall(parts),
  });
}

/** `next` for a hook. It has no `error` and no `called`: those exist only in a `.catch` handler. */
export const createNext = (parts: NextParts): ModNext<unknown, Output> =>
  base(parts, nextCall(parts, undefined));

/**
 * `next` for a `.catch` handler. When the hook had already called `next`, the handler's own call
 * gives that run's result and never runs what follows a second time.
 */
export function createCatchNext(
  parts: NextParts,
  failure: HookFailure,
  earlier: Tracked | undefined,
): ModCatchNext<unknown, Output> {
  return Object.assign(base(parts, nextCall(parts, earlier)), {
    error: failure,
    called: earlier !== undefined,
  });
}
