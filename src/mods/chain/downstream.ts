/** What runs after a hook: the later hooks, then Claude Code's own behaviour, as a stream that ends in the result. */
export type Stream = AsyncGenerator<unknown, unknown>;

/** One run of what follows a hook, seen again later: its stream, and its result once it has one. */
export interface Tracked {
  readonly stream: Stream;
  readonly result: Promise<unknown>;
}

function track(inner: Stream): Tracked {
  const { promise: result, resolve, reject } = Promise.withResolvers<unknown>();
  result.catch(() => undefined); // a caller that never looks must not raise an unhandled rejection
  async function* forward(): Stream {
    try {
      const value = yield* inner;
      resolve(value);
      return value;
    } catch (error) {
      reject(error);
      throw error;
    }
  }
  return { stream: forward(), result };
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
  /** Runs what follows, once more. */
  start(run: Stream): Tracked;
  /** The latest run, when `next` was called at all. */
  latest(): Tracked | undefined;
}

export function createDownstream(): Downstream {
  let latest: Tracked | undefined;
  return {
    start(run) {
      latest = track(run);
      return latest;
    },
    latest: () => latest,
  };
}
