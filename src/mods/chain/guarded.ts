import type { Budget } from '../../foundation/index.ts';
import { groupTimedOut, thrown, timedOut, type Failure } from './failure.ts';
import type { Stream } from './downstream.ts';

/** How one run of a hook (or of its handler) ended. */
export type Outcome = { readonly value: unknown } | { readonly failed: Failure };

/** What limits a run besides its own budget: the time all the hooks of an event share. */
export interface Limits {
  readonly budget: Budget;
  readonly group?: { readonly budget: Budget; readonly event: string };
}

export const isAsyncIterator = (value: unknown): value is Stream =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in value &&
  'next' in value &&
  typeof value.next === 'function';

/** Resolves with the failure once a limit is spent; never resolves while both have time. */
function expiry(limits: Limits): Promise<{ readonly failed: Failure }> {
  const own = limits.budget.expired.then(() => ({ failed: timedOut(limits.budget.ms) }));
  if (!limits.group) return own;
  const { budget, event } = limits.group;
  // The shared time is spent by whichever hook has the floor; one waiting inside `next` is not at fault.
  const shared = budget.expired.then(() =>
    limits.budget.isRunning()
      ? { failed: groupTimedOut(event, budget.ms) }
      : new Promise<never>(() => undefined),
  );
  return Promise.race([own, shared]);
}

/** Waits for one step of the run, or for the first limit to be spent, whichever comes first. */
function settle<T>(
  step: Promise<T>,
  expired: Promise<{ readonly failed: Failure }>,
): Promise<{ readonly done: T } | { readonly failed: Failure }> {
  return Promise.race([
    step.then(
      (done) => ({ done }),
      (error: unknown) => ({ failed: thrown(error) }),
    ),
    expired,
  ]);
}

/**
 * Follows what a hook returned under its limits. A function hook returned a promise; a generator
 * hook returned a stream whose chunks pass through. The hook's own time runs only while the hook
 * has the floor: a generator's time stops between pulls, and `next` and `$` stop it besides.
 */
export async function* guarded(out: unknown, limits: Limits): AsyncGenerator<unknown, Outcome> {
  const expired = expiry(limits);
  if (!isAsyncIterator(out)) {
    const ended = await settle(Promise.resolve(out), expired);
    return 'failed' in ended ? ended : { value: ended.done };
  }
  limits.budget.pause();
  for (;;) {
    limits.budget.resume();
    const ended = await settle(out.next(), expired);
    limits.budget.pause();
    if ('failed' in ended) return ended;
    if (ended.done.done) return { value: ended.done.value };
    yield ended.done.value;
  }
}
