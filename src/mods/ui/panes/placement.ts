import { MOD_LIMITS } from '../../../protocol/mods-limits.ts';
import type { Surface } from '../../../protocol/mods-ui-names.ts';
import type { Viewport } from '../sites/viewport.ts';

/** Who caused a `$.ui.open`: something the user did (a command, a button), or the mod by itself (a timer, a `turn.start` hook). */
export type OpenOrigin = 'user' | 'mod';

/** What `$.ui.open` resolves to: `{ isPlaced: true }`, or `{ isPlaced: false, reason }` for a pane that waits. */
export type Placement =
  | { readonly isPlaced: true }
  | { readonly isPlaced: false; readonly reason: string };

export interface PlacementInput {
  readonly origin: OpenOrigin;
  readonly surface: Surface;
  /** Absent until the app has measured its window. */
  readonly viewport: Viewport | undefined;
  /** The user has opened this pane once themselves. */
  readonly hasUserOpened: boolean;
}

/**
 * Whether a pane appears (interface.md, "When a pane waits for a wider terminal"): one opened by
 * something the user did appears at any width; one a mod opens by itself appears from 144 terminal
 * columns, or 110 once the user has opened that pane. Judgments: the rule is the terminal's (the
 * docs say "terminal"), so the other apps place the pane; and with no measured window a mod's own
 * pane waits, since it cannot be shown to fit.
 */
export function placePane(input: PlacementInput): Placement {
  if (input.origin === 'user' || input.surface !== 'terminal') return { isPlaced: true };
  const needed = input.hasUserOpened ? MOD_LIMITS.paneColumnsAfterOpen : MOD_LIMITS.paneColumns;
  const columns = input.viewport?.columns;
  if (columns === undefined) {
    return { isPlaced: false, reason: 'the terminal has not been measured yet' };
  }
  return columns >= needed
    ? { isPlaced: true }
    : {
        isPlaced: false,
        reason: `the terminal is ${columns} columns wide and a pane a mod opens by itself needs ${needed}`,
      };
}
