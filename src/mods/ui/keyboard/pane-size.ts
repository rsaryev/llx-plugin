/** A pane beside the transcript "stops widening at 45% of the terminal's width". */
const PANE_WIDTH_SHARE = 0.45;

/** The widest a pane beside the transcript may be in a terminal of `terminalColumns`. */
export const maxPaneColumns = (terminalColumns: number): number =>
  Math.floor(terminalColumns * PANE_WIDTH_SHARE);

/**
 * The width a pane gets: what `$.ui.open({ columns })` asked, or the width the user set, whichever
 * applies ("Once the user has resized a pane ... panes open there at the width they set instead"),
 * at most 45% of the terminal. `undefined` leaves the width to the host.
 */
export function paneColumns(input: {
  readonly asked: number | undefined;
  readonly userSet: number | undefined;
  readonly terminalColumns: number;
}): number | undefined {
  const wanted = input.userSet ?? input.asked;
  return wanted === undefined ? undefined : Math.min(wanted, maxPaneColumns(input.terminalColumns));
}

/**
 * Ctrl+X then an arrow key: "Left or Up gives it more room, and Right or Down gives the room back".
 * `step` is the host's columns for one press.
 */
export function resizedColumns(input: {
  readonly current: number;
  readonly direction: 'more' | 'less';
  readonly step: number;
  readonly terminalColumns: number;
}): number {
  const moved =
    input.direction === 'more' ? input.current + input.step : input.current - input.step;
  return Math.max(1, Math.min(moved, maxPaneColumns(input.terminalColumns)));
}
