import type { Clock } from '../../../ports/index.ts';
import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';

/** How often a site redraws: 10 a second, or 30 in the terminal for the visible pane, the expanded band and the hint line. */
export const REDRAW_RATES = {
  default: MOD_LIMITS.invalidatePerSecond,
  'terminal-visible': MOD_LIMITS.invalidatePerSecondTerminal,
} as const;
export type RedrawRate = keyof typeof REDRAW_RATES;

export interface RedrawGate {
  /** Asks for a redraw: now when the last one is old enough, else once, at the end of the wait. */
  invalidate(): void;
  /** Cancels a redraw that waits. */
  dispose(): void;
}

/**
 * Throttles redraws to the rate of `rate` and coalesces the calls that come sooner into one redraw
 * that runs `redraw` when it happens, so it reads the data as it is then (interface.md, "How often a
 * site can redraw": "Calls that come faster than the limit are coalesced into one redraw ... the
 * latest value shows and the values in between don't"). Judgment: the docs give the rates and the
 * coalescing, not the window; the kit keeps the redraws at least 1000 / rate ms apart, rounded up to
 * a whole millisecond (a minimum gap, so no second holds more redraws than the rate), the first at once.
 */
export function createRedrawGate(clock: Clock, rate: RedrawRate, redraw: () => void): RedrawGate {
  const gap = Math.ceil(1000 / REDRAW_RATES[rate]);
  let last: number | undefined;
  let cancel: (() => void) | undefined;
  const run = (): void => {
    cancel = undefined;
    last = clock.now();
    redraw();
  };
  return {
    invalidate() {
      if (cancel) return;
      const wait = last === undefined ? 0 : last + gap - clock.now();
      if (wait <= 0) return run();
      cancel = clock.setTimer(run, wait);
    },
    dispose() {
      cancel?.();
      cancel = undefined;
    },
  };
}
