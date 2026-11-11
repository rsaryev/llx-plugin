/**
 * What makes Claude Code run a `ui.render` hook again without a call to `$.ui.invalidate`
 * (interface.md, "When Claude Code redraws without being asked"): "when the site's props change or
 * the terminal's width changes", and once more after a `Client` failure and the `ui.fault` hooks.
 * "It doesn't run the hook on a timer, and it can't tell when a variable in your module changes."
 */
export const UNASKED_REDRAW = {
  props: true,
  width: true,
  clientFault: true,
  timer: false,
  moduleVariable: false,
} as const satisfies Readonly<Record<string, boolean>>;
export type RedrawCause = keyof typeof UNASKED_REDRAW;

export const redrawsUnasked = (cause: RedrawCause): boolean => UNASKED_REDRAW[cause];
