import type { Clock } from '../ports/index.ts';

/**
 * A time limit that only runs while the code it limits has the floor. `pause` stops the meter (the
 * limited code is waiting on something else) and `resume` starts it again; the two nest, so the
 * meter runs only when every pause has been resumed. Time is read from the `Clock` port, never
 * from the machine, and the limit is enforced with the port's timer.
 */
export interface Budget {
  /** The whole limit, in milliseconds. */
  readonly ms: number;
  /** What is left now, never below 0. */
  remainingMs(): number;
  pause(): void;
  resume(): void;
  /** Resolves once the running time has reached `ms`; never resolves after `dispose`. */
  readonly expired: Promise<void>;
  isExpired(): boolean;
  /** True while the meter runs: not paused, not expired, not disposed. */
  isRunning(): boolean;
  /** Stops the meter for good and releases its timer. */
  dispose(): void;
}

export interface BudgetOptions {
  /** A budget that runs only while this one's code has the floor: it is resumed with `parent` and paused with it. */
  readonly parent?: Budget;
  /** Start with the meter stopped: it runs from the first `resume`. */
  readonly paused?: boolean;
}

export function createBudget(clock: Clock, ms: number, options: BudgetOptions = {}): Budget {
  const { parent } = options;
  let consumed = 0;
  let since: number | undefined = options.paused ? undefined : clock.now();
  let pauses = options.paused ? 1 : 0;
  let counted = false;
  let expiredNow = false;
  let disposed = false;
  let cancelTimer: (() => void) | undefined;
  const { promise: expired, resolve: signalExpired } = Promise.withResolvers<void>();

  const spent = (): number => consumed + (since === undefined ? 0 : clock.now() - since);
  const remaining = (): number => Math.max(0, ms - spent());
  /** Tells the parent whether this budget is running now: its time is the parent's time. */
  const count = (running: boolean): void => {
    if (running === counted) return;
    counted = running;
    if (running) parent?.resume();
    else parent?.pause();
  };
  const disarm = (): void => {
    cancelTimer?.();
    cancelTimer = undefined;
  };
  const expire = (): void => {
    disarm();
    consumed = ms;
    since = undefined;
    expiredNow = true;
    count(false);
    signalExpired();
  };
  const arm = (): void => {
    if (remaining() === 0) return expire();
    cancelTimer = clock.setTimer(expire, remaining());
  };
  if (!options.paused) {
    count(true);
    arm();
  }

  return {
    ms,
    remainingMs: remaining,
    pause() {
      if (disposed || expiredNow) return;
      pauses += 1;
      if (pauses > 1) return;
      consumed = spent();
      since = undefined;
      disarm();
      count(false);
    },
    resume() {
      if (disposed || expiredNow || pauses === 0) return;
      pauses -= 1;
      if (pauses > 0) return;
      since = clock.now();
      count(true);
      arm();
    },
    expired,
    isExpired: () => expiredNow,
    isRunning: () => !disposed && !expiredNow && pauses === 0,
    dispose() {
      if (disposed) return;
      consumed = spent();
      since = undefined;
      disposed = true;
      disarm();
      count(false);
    },
  };
}
