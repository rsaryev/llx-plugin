import type { ChildRule, ChildTest } from './def.ts';
import { isElementNode, isEngineRef, type TreeChild } from './node.ts';
import { isText } from './text.ts';

const isTextChild = (child: TreeChild): boolean => isElementNode(child) && isText(child);

/**
 * What each element may hold. A `Button` holds "strings and `Text` elements ... Claude Code refuses
 * any other element inside a `Button`"; a `Text` holds strings and `Text` (judgment: the docs name
 * no rule for it, and it is the only element that nests text); a `Box` holds elements, strings and
 * Claude Code's own drawing (a band tree places the result of `next(e)` in one); the rest hold nothing.
 */
const CHILD_TESTS: { readonly [R in ChildRule]: ChildTest } = {
  none: () => false,
  text: (child) => typeof child === 'string' || isTextChild(child),
  any: () => true,
  label: (child) => typeof child === 'string' || isTextChild(child),
};

/** Why `child` cannot sit inside an element with this rule, or `undefined`. */
export function childProblem(
  element: string,
  rule: ChildRule,
  child: TreeChild,
): string | undefined {
  if (CHILD_TESTS[rule](child)) return undefined;
  const what = isEngineRef(child) ? "Claude Code's own drawing" : 'this child';
  return rule === 'none'
    ? `${element} takes no children`
    : `${element} cannot hold ${what}: it holds strings and Text only`;
}

/** `children` as a list: none is empty, a single child is a list of one. */
export function childrenFrom(children: unknown): readonly TreeChild[] {
  if (children === undefined) return [];
  // The elements are the caller's: a malformed child is the shape check's to report.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- children are checked when the tree is validated
  return (Array.isArray(children) ? children : [children]) as readonly TreeChild[];
}
