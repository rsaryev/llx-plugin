/**
 * Time, the only way the kit sees it (L3: no `Date`, no `setTimeout` in `src/`). A host passes the
 * real clock; a test passes `fixedClock` and moves time by hand.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** Run `fire` once after `ms`; the returned function cancels it. */
  setTimer(fire: () => void, ms: number): () => void;
  /** Resolve after `ms`, or reject with the signal's reason when `signal` aborts first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
