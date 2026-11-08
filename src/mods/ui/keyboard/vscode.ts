import type { RenderSite, Surface } from '../../../protocol/mods-ui-names.ts';

/**
 * The VS Code extension's differences (interface.md, "Draw in the VS Code extension"). The panel
 * itself is the host's; these are the rules the kit can state and a host applies.
 */

/** "in a panel 800 pixels or wider, panes dock beside the conversation"; narrower, they draw above the prompt box. */
const VSCODE_DOCK_MIN_PX = 800;
/** "a pane shows 12 rows before it scrolls" in the inline placement. */
const VSCODE_INLINE_PANE_ROWS = 12;

export type PanePlacement =
  | { readonly placement: 'dock'; readonly isFullscreen: true }
  | { readonly placement: 'inline'; readonly isFullscreen: false; readonly rows: number };

/** `e.props.placement` and `e.viewport.isFullscreen` of a pane for a panel `widthPx` wide. */
export const vscodePanePlacement = (widthPx: number): PanePlacement =>
  widthPx >= VSCODE_DOCK_MIN_PX
    ? { placement: 'dock', isFullscreen: true }
    : { placement: 'inline', isFullscreen: false, rows: VSCODE_INLINE_PANE_ROWS };

const VSCODE_STATUS_CHARS = 200;
const VSCODE_STATUS_ROWS = 2;
const VSCODE_TOAST_CHARS = 500;

/** "the panel cuts a status line at 200 characters or two rows". */
export function clipVscodeStatus(text: string): string {
  return text.split('\n').slice(0, VSCODE_STATUS_ROWS).join('\n').slice(0, VSCODE_STATUS_CHARS);
}

/** "and a toast at 500 characters". */
export const clipVscodeToast = (text: string): string => text.slice(0, VSCODE_TOAST_CHARS);

/** What the panel frames: "From the token-chart plugin" for a drawing, "Edited by the token-chart plugin" for a rewrite. */
export const VSCODE_LABELS = {
  drawn: (plugin: string): string => `From the ${plugin} plugin`,
  rewritten: (plugin: string): string => `Edited by the ${plugin} plugin`,
} as const;

/** "The stack is hidden while a permission request or a dialog shows." */
export const isStatusStackVisible = (shown: {
  readonly permissionRequest: boolean;
  readonly dialog: boolean;
}): boolean => !shown.permissionRequest && !shown.dialog;

/**
 * `$.prompt.suggest` in the panel "resolves with `isShown: false` and shows nothing, because the
 * panel keeps the prompt box's dim suggestion text for Claude's own suggestions."
 */
export const suggestionRefusedBy = (surface: Surface): { readonly isShown: false } | undefined =>
  surface === 'vscode' ? { isShown: false } : undefined;

/** The sites whose own drawing the panel keeps: "at `AskUserQuestion`, the panel keeps its own question card". */
const PANEL_KEEPS_OWN_CARD: ReadonlySet<RenderSite> = new Set<RenderSite>(['AskUserQuestion']);

/**
 * Whether the `props` a hook passes to `next` change what the app draws at `site`: in the panel
 * they do not change the question card, though "draws your elements above it".
 */
export const propsReachSite = (surface: Surface, site: RenderSite): boolean =>
  !(surface === 'vscode' && PANEL_KEEPS_OWN_CARD.has(site));
