import { buttonKey, isButton } from '../elements/button.ts';
import { isElementNode, walkTree, type ElementNode } from '../elements/node.ts';

/** The controls a user can use, each addressed by its key. */
export const CONTROL_TYPES = ['Button', 'Input', 'Select'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

export interface Control {
  readonly key: string;
  readonly type: ControlType;
  readonly node: ElementNode;
}

const isControlType = (type: string): type is ControlType =>
  CONTROL_TYPES.some((known) => known === type);

/** The key a control is addressed by: a button's `key`, `label` or single string child; an `Input` or `Select`'s `key`. */
export function controlKey(node: ElementNode): string | undefined {
  if (isButton(node)) return buttonKey(node);
  const { key } = node.props;
  return typeof key === 'string' && key !== '' ? key : undefined;
}

/** The controls of a tree with a key, in document order. */
export function collectControls(tree: unknown): readonly Control[] {
  const found: Control[] = [];
  for (const { node } of walkTree(tree)) {
    if (!isElementNode(node) || !isControlType(node.type)) continue;
    const key = controlKey(node);
    if (key !== undefined) found.push({ key, type: node.type, node });
  }
  return found;
}
