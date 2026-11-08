/** The interface of mods: elements, render sites, panes, controls and redraws (plugins/mods/interface.md, reference.md). */
export { createModsUi, type FaultReport, type ModsUi, type ModsUiOptions } from './runtime.ts';
export { withUiRules } from './rules.ts';
export { uiApi, logLine, statusLine, type UiParts } from './ui-api.ts';
export type { CopyResult, ModInterface, NotifyResult } from './ports.ts';
export { defaultElementTable, type ElementFn, type ElementTable } from './elements/table.ts';
export {
  isElementNode,
  isEngineRef,
  type ElementNode,
  type EngineRef,
  type Props,
  type TreeChild,
} from './elements/node.ts';
export { treeProblem } from './elements/validate.ts';
export { measureTree, sizeProblem, clipText, type TreeSize } from './elements/limits.ts';
export { drawnNode, drawnProps } from './elements/surface.ts';
export { textStyle, type TextStyle } from './elements/text.ts';
export { borderOf, isSpacingStep } from './elements/box.ts';
export { spacingCells, type SpacingCells } from './elements/spacing.ts';
export { drawsAsLink } from './elements/link.ts';
export { clientFailure, clientFailureLine, faultReason, NO_MESSAGE } from './elements/client.ts';
export { buttonKey } from './elements/button.ts';
export { decideSite, renderEvent, type RenderEvent, type RenderRequest } from './sites/registry.ts';
export { foldRender, type Drawn, type FoldOptions } from './sites/fold.ts';
export { bandProblem, BAND_FORBIDDEN_PROPS } from './sites/band.ts';
export type { Viewport } from './sites/viewport.ts';
export { parseOpen, type OpenRequest } from './panes/open.ts';
export { placePane, type OpenOrigin, type Placement } from './panes/placement.ts';
export {
  createPaneRegistry,
  type CloseKind,
  type PaneInfo,
  type PaneRegistry,
} from './panes/registry.ts';
export { collectControls, controlKey, type Control } from './controls/keys.ts';
export { routeControl, type Gesture, type RouteOptions, type Routed } from './controls/route.ts';
export { actionButtons, digitButton, hotkeyTable, type HotkeyContext } from './controls/hotkeys.ts';
export { createRedrawGate, REDRAW_RATES, type RedrawGate, type RedrawRate } from './redraw/gate.ts';
export { createInvalidator, type Invalidator } from './redraw/invalidate.ts';
export { createToastBoard, parseToast, TOAST_TIMEOUT_PROBLEM, type ToastBoard } from './toast.ts';
export { createElementTables, resolveTables, type ElementTables } from './tables.ts';
export { handleKey, type KeyContext, type KeyResult, type KeyState } from './keyboard/keys.ts';
export { NAMED_KEYS, type KeyEffect, type NamedKey } from './keyboard/effects.ts';
export { grantsFocus, clickFocuses, initialFocus, type FocusGrantInput } from './keyboard/focus.ts';
export { createBandState, collapsedRow, COLLAPSE_MARK, type BandState } from './keyboard/band.ts';
export { maxPaneColumns, paneColumns, resizedColumns } from './keyboard/pane-size.ts';
export {
  VSCODE_LABELS,
  clipVscodeStatus,
  clipVscodeToast,
  isStatusStackVisible,
  propsReachSite,
  suggestionRefusedBy,
  vscodePanePlacement,
  type PanePlacement,
} from './keyboard/vscode.ts';
export { drawFaultLine } from './sites/draw-fault.ts';
export { redrawsUnasked, type RedrawCause } from './redraw/unasked.ts';
