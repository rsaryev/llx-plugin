import type { Clock } from '../../ports/index.ts';

/**
 * `HookBudget.lingerMs` (claude-code/index.d.ts:5428): "How long a hook may keep running after
 * `next.signal` aborted (the person interrupted, a hook above settled first, its own budget ran
 * out). Past it the hook is reported as lingering; the dispatch had already gone on without it".
 * The watch follows one run's own steps (a function hook's promise, each pull of a generator hook):
 * once the signal has aborted while a step is unsettled, a timer of `ms` starts on the chain's
 * clock, and if that step is still unsettled when it fires, `report` runs, once per run. The timer
 * outlives the dispatch; a step that settles cancels it, and nothing is held after that.
 */
export type LingerWatch = (step: Promise<unknown>) => void;

export function watchLinger(
  clock: Clock,
  signal: AbortSignal,
  ms: number,
  report: () => void,
): LingerWatch {
  let pending: Promise<unknown> | undefined;
  let cancel: (() => void) | undefined;
  let reported = false;
  const arm = (): void => {
    const held = pending;
    if (held === undefined || cancel !== undefined || reported) return;
    cancel = clock.setTimer(() => {
      cancel = undefined;
      if (pending !== held) return;
      reported = true;
      report();
    }, ms);
  };
  signal.addEventListener('abort', arm, { once: true });
  return (step) => {
    pending = step;
    const settled = (): void => {
      if (pending !== step) return;
      pending = undefined;
      cancel?.();
      cancel = undefined;
    };
    step.then(settled, settled);
    if (signal.aborted) arm();
  };
}
