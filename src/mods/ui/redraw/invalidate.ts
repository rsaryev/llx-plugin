import type { Clock } from '../../../ports/index.ts';
import { createRedrawGate, type RedrawGate } from './gate.ts';

export interface InvalidatorOptions {
  readonly clock: Clock;
  /** Draws the mods' sites again: the host runs the `ui.render` hooks. */
  readonly redraw: () => void;
  /** Whether the redraw is of the visible pane, the expanded band or the hint line in the terminal: those redraw faster. */
  readonly isTerminalVisible: () => boolean;
}

export interface Invalidator {
  /** `$.ui.invalidate('ui.render')`, throttled. */
  invalidate(): void;
  dispose(): void;
}

/** `$.ui.invalidate`: a call is throttled by the rate of what it redraws, two gates in all. */
export function createInvalidator(options: InvalidatorOptions): Invalidator {
  const gates: readonly [RedrawGate, RedrawGate] = [
    createRedrawGate(options.clock, 'default', options.redraw),
    createRedrawGate(options.clock, 'terminal-visible', options.redraw),
  ];
  return {
    invalidate() {
      gates[options.isTerminalVisible() ? 1 : 0].invalidate();
    },
    dispose() {
      for (const gate of gates) gate.dispose();
    },
  };
}
