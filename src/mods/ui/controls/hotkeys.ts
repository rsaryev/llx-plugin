import type { UiSurface } from '../../../protocol/mods-ui-names.ts';
import { isButton } from '../elements/button.ts';
import { isElementNode, walkTree, type ElementNode } from '../elements/node.ts';

export interface HotkeyContext {
  readonly surface: UiSurface;
  /** Whether the tree is the band above the prompt (digit hotkeys work there). */
  readonly isBand: boolean;
  /** Whether the user collapsed the band: "neither an `action` binding nor a hotkey presses a button in it". */
  readonly isCollapsed: boolean;
  /** Whether the pane or band has keyboard focus: "that happens only while your pane or band has keyboard focus. The rest of the time, keys go to the prompt". */
  readonly hasFocus: boolean;
  /** Whether an `Input` of the drawing has the focus: "every printable key goes to the field". */
  readonly isInputFocused: boolean;
}

/** Buttons of a tree in document order. */
function buttons(tree: unknown): readonly ElementNode[] {
  return [...walkTree(tree)].flatMap(({ node }) =>
    isElementNode(node) && isButton(node) ? [node] : [],
  );
}

/** Whether keys can press buttons at all: not in the VS Code extension ("buttons have no hotkeys"), not in a collapsed band. */
const pressableByKey = (context: HotkeyContext): boolean =>
  context.surface !== 'vscode' && !(context.isBand && context.isCollapsed);

/**
 * The button each hotkey names, wherever the keyboard focus is: "when two buttons in one drawing
 * name the same `hotkey`, the later one gets it" (reference.md, "Elements").
 */
function namedHotkeys(tree: unknown, context: HotkeyContext): ReadonlyMap<string, ElementNode> {
  const table = new Map<string, ElementNode>();
  if (!pressableByKey(context)) return table;
  for (const button of buttons(tree)) {
    const { hotkey } = button.props;
    if (typeof hotkey === 'string') table.set(hotkey, button);
  }
  return table;
}

/**
 * The button each hotkey presses now: a hotkey presses its button only while the pane or band has
 * keyboard focus, and while an `Input` has it every printable key goes to the field (interface.md,
 * "Keyboard focus and hotkeys", "What each key does").
 */
export function hotkeyTable(
  tree: unknown,
  context: HotkeyContext,
): ReadonlyMap<string, ElementNode> {
  if (!context.hasFocus || context.isInputFocused) return new Map();
  return namedHotkeys(tree, context);
}

/**
 * The button a digit typed alone into an empty prompt (and then a pause) presses: "a digit `hotkey`
 * on a button in the band also fires" (reference.md, "Elements"). Only the band has it, and it is
 * one of the two presses that need no keyboard focus (the other is an `action` binding).
 */
export function digitButton(
  tree: unknown,
  context: HotkeyContext,
  typed: string,
  isPromptEmpty: boolean,
): ElementNode | undefined {
  if (!context.isBand || !isPromptEmpty || !/^[0-9]$/.test(typed)) return undefined;
  return namedHotkeys(tree, context).get(typed);
}

/** Whether a keybinding presses a button's `action`: "when that binding is a chord or a modified key". */
const bindingPressesAction = (binding: string): boolean =>
  /\s/.test(binding.trim()) || /(ctrl|alt|meta|shift|cmd)\+/i.test(binding);

/** The buttons the user's `binding` of the keybinding action `action` presses. */
export function actionButtons(
  tree: unknown,
  context: HotkeyContext,
  action: string,
  binding: string,
): readonly ElementNode[] {
  if (!pressableByKey(context) || !bindingPressesAction(binding)) return [];
  return buttons(tree).filter((button) => button.props.action === action);
}
