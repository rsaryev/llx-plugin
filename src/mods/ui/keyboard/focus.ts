import type { UiSurface } from '../../../protocol/mods-ui-names.ts';
import type { Control } from '../controls/keys.ts';
import { isElementNode } from '../elements/node.ts';
import { collectControls } from '../controls/keys.ts';

/** What caused a `$.ui.open` that asks for focus: a command or a press is the user's; a timer or hook is the mod's. */
export interface FocusGrantInput {
  readonly requested: boolean;
  /** The pane opened "from a command or a press". */
  readonly fromUserAction: boolean;
  readonly surface: UiSurface;
  readonly isPromptEmpty: boolean;
  /** Something else (a dialog, another pane) has keyboard focus. */
  readonly otherHasFocus: boolean;
  /** The VS Code panel: it has the focus, Claude is idle, and no question waits. */
  readonly panel?: {
    readonly hasFocus: boolean;
    readonly isIdle: boolean;
    readonly questionWaiting: boolean;
  };
}

/**
 * Whether `focus: true` is granted (interface.md, "How a pane gets keyboard focus"; "Draw in the VS
 * Code extension", "Keyboard focus"). Claude Code grants it "only while the prompt is empty and
 * nothing else has keyboard focus", so a pane that opens while the user types takes no keystrokes;
 * the panel adds that it has focus, Claude is idle and no question waits. Judgment: the Desktop app
 * follows the terminal's rule, the docs state none for it.
 */
export function grantsFocus(input: FocusGrantInput): boolean {
  if (!input.requested || !input.isPromptEmpty) return false;
  if (input.surface === 'vscode') {
    const panel = input.panel;
    return panel !== undefined && panel.hasFocus && panel.isIdle && !panel.questionWaiting;
  }
  return input.fromUserAction && !input.otherHasFocus;
}

/**
 * Whether a click gives a pane focus: "in the terminal needs fullscreen rendering". Judgment: the
 * other apps take clicks as they are.
 */
export const clickFocuses = (surface: UiSurface, isFullscreen: boolean): boolean =>
  surface !== 'terminal' || isFullscreen;

/**
 * The control that has the focus when a pane opens: the first with `autoFocus: true`. "In the VS
 * Code extension, `autoFocus` does nothing: the control draws as if you had left it out."
 */
export function initialFocus(tree: unknown, surface: UiSurface): string | undefined {
  if (surface === 'vscode') return undefined;
  const wanted = (control: Control): boolean =>
    isElementNode(control.node) && control.node.props.autoFocus === true;
  return collectControls(tree).find(wanted)?.key;
}
