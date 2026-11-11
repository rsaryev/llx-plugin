import { controlKey } from '../controls/keys.ts';
import { isElementNode, type ElementNode, type Props, type TreeChild } from './node.ts';

/**
 * A drawn tree as plain data, and its controls' callbacks apart, by the key each control is
 * addressed by (interface.md, "Which controls need a `key`": "Tests and other mods identify a
 * control by its key"). The tree crosses a process or an isolate as JSON; the callbacks stay
 * where the module runs, and `joinHandlers` puts them back. Judgment (spec/judgments.md): the
 * docs give the `{ type, props, children }` shape (test.md, "Test a drawing") and the key, not a
 * wire form. Call it on a tree `treeProblem` accepted: a callback of an element with no key, which
 * no one can reach, is dropped.
 */
export interface SplitTree {
  /** The tree with every function prop left out. */
  readonly tree: ElementNode;
  /** Each control's function props (`onPress`, `onInput`, `onSubmit`, `onSelect`), by its key. */
  readonly handlers: ReadonlyMap<string, Props>;
}

const isFunction = ([, value]: readonly [string, unknown]): boolean => typeof value === 'function';

function plainOf(node: ElementNode, handlers: Map<string, Props>): ElementNode {
  const entries = Object.entries(node.props);
  const callbacks = entries.filter(isFunction);
  const key = controlKey(node);
  if (key !== undefined && callbacks.length > 0) handlers.set(key, Object.fromEntries(callbacks));
  return {
    type: node.type,
    props: Object.fromEntries(entries.filter((entry) => !isFunction(entry))),
    children: node.children.map((child) => childOf(child, (each) => plainOf(each, handlers))),
  };
}

const childOf = (child: TreeChild, element: (node: ElementNode) => ElementNode): TreeChild =>
  isElementNode(child) ? element(child) : child;

/** The tree as plain data, and the callbacks it held by control key. */
export function splitHandlers(root: ElementNode): SplitTree {
  const handlers = new Map<string, Props>();
  return { tree: plainOf(root, handlers), handlers };
}

/** The plain tree with each control's callbacks back on it, found by the control's key. */
export function joinHandlers(tree: ElementNode, handlers: ReadonlyMap<string, Props>): ElementNode {
  const key = controlKey(tree);
  const own = key === undefined ? undefined : handlers.get(key);
  return {
    type: tree.type,
    props: own === undefined ? tree.props : { ...tree.props, ...own },
    children: tree.children.map((child) => childOf(child, (each) => joinHandlers(each, handlers))),
  };
}
