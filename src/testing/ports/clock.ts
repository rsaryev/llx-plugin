import type { Clock } from '../../ports/index.ts';

interface Timer {
  readonly at: number;
  readonly fire: () => void;
}

/**
 * A `Clock` that stands still until the test calls `advance(ms)`, which moves `now()` and fires
 * every timer that falls due, earliest first (a timer set from a callback fires in the same call
 * when it is due). `pending()` is the number of timers not yet fired or cancelled.
 */
export function fixedClock(start = 0): Clock & {
  advance(ms: number): void;
  pending(): number;
} {
  let current = start;
  const timers = new Set<Timer>();
  const setTimer = (fire: () => void, ms: number): (() => void) => {
    const timer = { at: current + ms, fire };
    timers.add(timer);
    return () => timers.delete(timer);
  };
  const nextDue = (limit: number): Timer | undefined =>
    [...timers].filter((timer) => timer.at <= limit).toSorted((a, b) => a.at - b.at)[0];
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
    advance(ms) {
      const limit = current + ms;
      for (let due = nextDue(limit); due; due = nextDue(limit)) {
        timers.delete(due);
        current = Math.max(current, due.at);
        due.fire();
      }
      current = limit;
    },
    pending: () => timers.size,
  };
}
