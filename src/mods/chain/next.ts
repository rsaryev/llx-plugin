import type { Budget } from '../../foundation/index.ts';
import { deepFreeze } from '../../foundation/index.ts';
import type { HookFailure, HookOrigin, ModTier } from '../../protocol/mods-events.ts';
import type { ModCatchNext, ModHookStream, ModNext, SkipTier } from '../types.ts';
import { drain, finish, type Downstream, type Stream, type Tracked } from './downstream.ts';
import { createSlot, traceOfSlot, type Slot } from './link-trace.ts';
import { selects } from './select.ts';
import { nestingProblem } from './nesting.ts';
import { skipProblem } from './tiers.ts';
import type { TraceEntry } from '../trace-types.ts';

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
  /** The event's name: `next.event`, and what `next.is` tests. */
  readonly event: string;
  /** Runs the chain from the first hook at `index`, then Claude Code's own behaviour, filling `slot`. */
  readonly runAt: (index: number, e: unknown, slot: Slot) => Stream;
  /** The links a `next.to` from this hook goes beneath, between `from` and `to`, for its trace. */
  readonly bypassed: (from: number, to: number, e: unknown) => Slot['bypassed'];
  /** The index of the hook after this one. */
  readonly after: number;
  /** Where a tier starts in the chain. */
  readonly tierStart: (tier: SkipTier) => number;
  /** Why the event this hook passes to `next` is refused, besides nesting. */
  readonly changeProblem: (e: unknown) => string | undefined;
  readonly downstream: Downstream;
  /** The mod whose hook this is: a `next()` with no argument names it. */
  readonly plugin: string;
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

type HookStream = ModHookStream<unknown, unknown>;

/**
 * `stream` with `result`: it settles with what beneath returned once the stream is read to its end,
 * and rejects if the stream is closed (or fails) before that.
 */
function hookStream(stream: Stream): HookStream {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  promise.catch(() => undefined); // a hook that never reads `result` must not raise an unhandled rejection
  async function* read(): Stream {
    let ended = false;
    try {
      const value = yield* stream;
      ended = true;
      resolve(value);
      return value;
    } catch (error) {
      reject(error);
      throw error;
    } finally {
      if (!ended) reject(new Error('next(e): the stream was closed before its end'));
    }
  }
  return Object.assign(read(), { result: promise });
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
  if (parts.isGenerator)
    return hookStream(metered(replay ? finish(run) : run.stream, parts.budget));
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

/** The refusal of a `next()` called with no argument (claude-code/index.d.ts:6969: "it rejects, naming the hook"). */
const noArgument = (parts: NextParts): string =>
  `next() takes the event: the ${parts.event} hook of ${parts.plugin} called it with none`;

function nextCall(parts: NextParts, replay: Tracked | undefined): (...args: unknown[]) => Output {
  return (...args) => {
    if (args.length === 0) return refuse(parts, noArgument(parts));
    const [e] = args;
    if (replay) return outputOf(parts, replay, true);
    const problem = refusalOf(parts, e);
    if (problem !== undefined) return refuse(parts, `next argument: ${problem}`);
    const slot = createSlot();
    const run = parts.runAt(parts.after, deepFreeze(e), slot);
    return outputOf(parts, parts.downstream.start(run, slot), false);
  };
}

function skipCall(parts: NextParts): (e: unknown, tier: SkipTier) => Output {
  return (e, tier) => {
    const problem = skipProblem(parts.tier, tier) ?? refusalOf(parts, e);
    if (problem !== undefined) return refuse(parts, problem);
    const frozen = deepFreeze(e);
    const to = parts.tierStart(tier);
    const slot: Slot = { ...createSlot(), bypassed: parts.bypassed(parts.after, to, frozen) };
    return outputOf(parts, parts.downstream.start(parts.runAt(to, frozen, slot), slot), false);
  };
}

/**
 * The fields every `next` has (claude-code/index.d.ts:6977, `Next`), and no other; `trace` is read
 * fresh, so a link still running joins in place later.
 */
function base(parts: NextParts, call: (...args: unknown[]) => Output) {
  const next = Object.assign(call, {
    signal: parts.signal,
    origin: parts.origin,
    budget: budgetView(parts.budget),
    to: skipCall(parts),
    event: parts.event,
    is: (pattern: string, _e: unknown): boolean => selects(pattern, parts.event),
    trace: traceOfSlot(undefined),
  });
  Object.defineProperty(next, 'trace', {
    enumerable: true,
    get: (): readonly TraceEntry[] => traceOfSlot(parts.downstream.latest()?.slot),
  });
  return next;
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
