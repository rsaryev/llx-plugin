import type { Slot } from './link-trace.ts';

/** What runs after a hook: the later hooks, then Claude Code's own behaviour, as a stream that ends in the result. */
export type Stream = AsyncGenerator<unknown, unknown>;

/** One run of what follows a hook, seen again later: its stream, and its result once it has one. */
export interface Tracked {
  readonly stream: Stream;
  readonly result: Promise<unknown>;
  /** Where the link that runs first fills its `next.trace` entry. */
  readonly slot: Slot;
  /** The result once the run has ended with one: what a hook that returns it unchanged passes on. */
  ended(): { readonly value: unknown } | undefined;
  /** What the run rejected with, once it has: what a hook that lets it through rethrows. */
  rejected(): { readonly error: unknown } | undefined;
}

function track(inner: Stream, slot: Slot): Tracked {
  const { promise: result, resolve, reject } = Promise.withResolvers<unknown>();
  result.catch(() => undefined); // a caller that never looks must not raise an unhandled rejection
  let ended: { readonly value: unknown } | undefined;
  let rejected: { readonly error: unknown } | undefined;
  async function* forward(): Stream {
    try {
      const value = yield* inner;
      ended = { value };
      resolve(value);
      return value;
    } catch (error) {
      rejected = { error };
      reject(error);
      throw error;
    }
  }
  return { stream: forward(), result, slot, ended: () => ended, rejected: () => rejected };
}

/** Pulls a stream to its end, dropping the chunks, and gives its result. A function hook's `next` is this. */
export async function drain(run: Tracked): Promise<unknown> {
  for (let step = await run.stream.next(); !step.done; step = await run.stream.next()) {
    // chunks belong to the hooks that forward them; a function hook has none to forward
  }
  return run.result;
}

/** What is left of a run: its remaining chunks, then its result. */
export async function* finish(run: Tracked): Stream {
  for (let step = await run.stream.next(); !step.done; step = await run.stream.next()) {
    yield step.value;
  }
  return run.result;
}

/**
 * What one hook has done with `next`. The hook and its `.catch` handler share it: a call that was
 * made stands, and is never made again (events.md, "Handle a hook that fails").
 */
export interface Downstream {
  /** Runs what follows, once more, filling `slot`. */
  start(run: Stream, slot: Slot): Tracked;
  /** The latest run, when `next` was called at all. */
  latest(): Tracked | undefined;
  /** How long the runs took that settled: the time the hook's `next` calls were in flight. */
  spentMs(): number;
}

export function createDownstream(): Downstream {
  let latest: Tracked | undefined;
  const slots: Slot[] = [];
  return {
    start(run, slot) {
      slots.push(slot);
      latest = track(run, slot);
      return latest;
    },
    latest: () => latest,
    spentMs: () => slots.reduce((sum, slot) => sum + (slot.wallMs ?? 0), 0),
  };
}
