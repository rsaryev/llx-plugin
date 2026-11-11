/**
 * The band's collapse (interface.md, "When the user collapses the band"). "The band stays collapsed
 * until the user expands it, even after `/clear`, and is expanded again the next time Claude Code
 * starts": the state belongs to the process, not the session. Your mod "can't expand it or tell that
 * it's collapsed", so the state is the host's and no `e.props` carries it.
 */
export interface BandState {
  isCollapsed(): boolean;
  /** Ctrl+X then Ctrl+A, a click on `[-]` or on the dim row. */
  toggle(): boolean;
  /** `/clear`, `/resume`, `/branch`: the band stays as it is. */
  sessionReset(): void;
}

export function createBandState(): BandState {
  let collapsed = false;
  return {
    isCollapsed: () => collapsed,
    toggle: () => {
      collapsed = !collapsed;
      return collapsed;
    },
    sessionReset: () => undefined,
  };
}

/** The mark at the right end of the expanded band's first row, which a click in fullscreen rendering collapses. */
export const COLLAPSE_MARK = '[-]';

/**
 * The one dim row of a collapsed band: `▸ plugin panel hidden · ctrl+x ctrl+a or click to show`,
 * naming "the keys that expand it as the user has them bound".
 */
export const collapsedRow = (keys = 'ctrl+x ctrl+a'): string =>
  `▸ plugin panel hidden · ${keys} or click to show`;
