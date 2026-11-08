import { VSCODE_IGNORED, type Surface } from '../../../protocol/mods-ui-names.ts';
import { childrenFrom } from './children.ts';
import { isElementNode, type ElementNode, type TreeChild } from './node.ts';

/**
 * What an app draws of an element: the VS Code extension "ignores some element props and draws the
 * element as if you had left them out" (reference.md, "Elements"). The other apps ignore none the
 * docs name.
 */
export function drawnProps(surface: Surface, node: ElementNode): ElementNode['props'] {
  if (surface !== 'vscode') return node.props;
  const ignored = new Set(VSCODE_IGNORED[node.type]);
  return Object.fromEntries(Object.entries(node.props).filter(([prop]) => !ignored.has(prop)));
}

function drawnChild(surface: Surface, child: TreeChild): TreeChild {
  return isElementNode(child) ? drawnNode(surface, child) : child;
}

/** The tree as `surface` draws it: every element without the props the app ignores. */
export function drawnNode(surface: Surface, node: ElementNode): ElementNode {
  return {
    type: node.type,
    props: drawnProps(surface, node),
    children: childrenFrom(node.children).map((child) => drawnChild(surface, child)),
  };
}
