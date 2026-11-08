import type { Clock } from '../../ports/index.ts';

/**
 * The clock of `mock.clock(on)` (plugins/mods/test.md, "Test a timer"): it starts at `0` (or the
 * `now` given) and moves only when the test moves it. Every method that moves time resolves after
 * the timers that came due have run, and after what they started has settled.
 */
export interface MockClock extends Clock {
  /** Moves the time forward by `ms` and runs each timer that comes due. */
  advance(ms: number): Promise<void>;
  /** Moves the time forward to `ms`, as `advance` would; an earlier time moves nothing. */
  set(ms: number): Promise<void>;
  /** Runs timers that are already due, such as a chain of zero-delay `$.clock.after` calls, without moving the time. */
  settle(): Promise<void>;
}

interface Timer {
  readonly at: number;
  readonly fire: () => void;
}

/** Lets the promises a timer's callback started run to their end: the chain is a few hops deep, not unbounded. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 64; turn += 1) await Promise.resolve();
}

const SETTLE_LIMIT = 10_000;

export function createMockClock(start = 0): MockClock {
  let current = start;
  const timers = new Set<Timer>();
  const dueBy = (limit: number): Timer | undefined =>
    [...timers].filter((timer) => timer.at <= limit).toSorted((a, b) => a.at - b.at)[0];
  const setTimer = (fire: () => void, ms: number): (() => void) => {
    const timer = { at: current + ms, fire };
    timers.add(timer);
    return () => timers.delete(timer);
  };
  async function runDue(limit: number): Promise<void> {
    for (let run = 0, due = dueBy(limit); due && run < SETTLE_LIMIT; due = dueBy(limit), run += 1) {
      timers.delete(due);
      current = Math.max(current, due.at);
      due.fire();
      await flush();
    }
  }
  return {
    now: () => current,
    setTimer,
    sleep: (ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const cancel = setTimer(resolve, ms);
        signal?.addEventListener(
          'abort',
          () => {
            cancel();
            reject(signal.reason);
          },
          { once: true },
        );
      }),
    async advance(ms) {
      const limit = current + ms;
      await runDue(limit);
      current = Math.max(current, limit);
      await flush();
    },
    async set(ms) {
      await runDue(ms);
      current = Math.max(current, ms);
      await flush();
    },
    async settle() {
      await runDue(current);
      await flush();
    },
  };
}
