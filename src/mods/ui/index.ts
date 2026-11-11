/** The interface of mods: elements, render sites, panes, controls and redraws (plugins/mods/interface.md, reference.md). */
export { createModsUi, type FaultReport, type ModsUi, type ModsUiOptions } from './runtime.ts';
export { uiRules } from './rules.ts';
export { uiApi, type UiParts } from './ui-api.ts';
export type { CopyResult, ModInterface, NotifyResult } from './ports.ts';
export * from './elements/index.ts';
export { decideSite, renderEvent, type RenderEvent, type RenderRequest } from './sites/registry.ts';
export { backdropRender } from './sites/backdrop.ts';
export { foldRender, type Drawn, type FoldOptions } from './sites/fold.ts';

export type { Viewport } from './sites/viewport.ts';
export { parseOpen, type OpenRequest } from './panes/open.ts';
export { placePane, type OpenOrigin, type Placement } from './panes/placement.ts';
export {
  createPaneRegistry,
  type CloseKind,
  type PaneInfo,
  type PaneRegistry,
} from './panes/registry.ts';
export {
  createPlacedRows,
  type PlacedRow,
  type PlacedRows,
  type PlaceResult,
} from './placed/rows.ts';
export { collectControls, controlKey, type Control } from './controls/keys.ts';
export { routeControl, type Gesture, type RouteOptions, type Routed } from './controls/route.ts';
export { actionButtons, digitButton, hotkeyTable, type HotkeyContext } from './controls/hotkeys.ts';
export { createRedrawGate, REDRAW_RATES, type RedrawGate, type RedrawRate } from './redraw/gate.ts';
export { type Invalidator } from './redraw/invalidate.ts';
export { createToastBoard, type ToastBoard } from './toast.ts';
export { type ElementTables } from './tables.ts';
export { handleKey, type KeyContext, type KeyResult, type KeyState } from './keyboard/keys.ts';
export { type KeyEffect } from './keyboard/effects.ts';
export { grantsFocus, clickFocuses, initialFocus, type FocusGrantInput } from './keyboard/focus.ts';
export { createBandState, collapsedRow, COLLAPSE_MARK, type BandState } from './keyboard/band.ts';
export { paneColumns, resizedColumns } from './keyboard/pane-size.ts';
export {
  VSCODE_LABELS,
  isStatusStackVisible,
  propsReachSite,
  suggestionRefusedBy,
  vscodePanePlacement,
  type PanePlacement,
} from './keyboard/vscode.ts';
export { drawFaultLine } from './sites/draw-fault.ts';
export { redrawsUnasked, type RedrawCause } from './redraw/unasked.ts';
