import type { Surface } from '../../../protocol/mods-ui-names.ts';
import { isButton } from '../elements/button.ts';
import { isElementNode, walkTree, type ElementNode } from '../elements/node.ts';

export interface HotkeyContext {
  readonly surface: Surface;
  /** Whether the tree is the band above the prompt (digit hotkeys work there). */
  readonly isBand: boolean;
  /** Whether the user collapsed the band: "neither an `action` binding nor a hotkey presses a button in it". */
  readonly isCollapsed: boolean;
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
 * The button each hotkey presses: "when two buttons in one drawing name the same `hotkey`, the
 * later one gets it" (reference.md, "Elements").
 */
export function hotkeyTable(
  tree: unknown,
  context: HotkeyContext,
): ReadonlyMap<string, ElementNode> {
  const table = new Map<string, ElementNode>();
  if (!pressableByKey(context)) return table;
  for (const button of buttons(tree)) {
    const { hotkey } = button.props;
    if (typeof hotkey === 'string') table.set(hotkey, button);
  }
  return table;
}

/**
 * The button a digit typed alone into an empty prompt (and then a pause) presses: "a digit `hotkey`
 * on a button in the band also fires" (reference.md, "Elements"). Only the band has it.
 */
export function digitButton(
  tree: unknown,
  context: HotkeyContext,
  typed: string,
  isPromptEmpty: boolean,
): ElementNode | undefined {
  if (!context.isBand || !isPromptEmpty || !/^[0-9]$/.test(typed)) return undefined;
  return hotkeyTable(tree, context).get(typed);
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
