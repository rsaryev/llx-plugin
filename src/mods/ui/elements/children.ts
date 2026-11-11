import type { ChildRule, ChildTest } from './def.ts';
import { isElementNode, isEngineRef, type TreeChild } from './node.ts';
import { isText } from './text.ts';
import { isRecord } from '../../../protocol/is-record.ts';

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

/** Why `child` is not a child at all: neither a string, an element nor Claude Code's own drawing. */
function strayProblem(element: string, child: unknown): string | undefined {
  if (typeof child === 'string' || isElementNode(child) || isEngineRef(child)) return undefined;
  const type = isRecord(child) ? child.type : undefined;
  return typeof type === 'string'
    ? `${element} holds "${type}", which is not an element`
    : `${element} holds a child that is not a string, an element or Claude Code's own drawing`;
}

/** Why `child` cannot sit inside an element with this rule, or `undefined`. */
export function childProblem(
  element: string,
  rule: ChildRule,
  child: TreeChild,
): string | undefined {
  if (rule !== 'none') {
    const stray = strayProblem(element, child);
    if (stray !== undefined) return stray;
  }
  if (CHILD_TESTS[rule](child)) return undefined;
  const what = isEngineRef(child) ? "Claude Code's own drawing" : 'this child';
  return rule === 'none'
    ? `${element} takes no children`
    : `${element} cannot hold ${what}: it holds strings and Text only`;
}

/**
 * One child as an element holds it (claude-code/index.d.ts:10224, `RenderChildren`): "a number (drawn
 * as its string)", and "`false`, `null` and `undefined` are dropped" (judgment: `true`, which JSX's
 * `{flag && x}` also yields, is dropped with them).
 */
const normalised = (child: unknown): unknown[] => {
  if (child === undefined || child === null || typeof child === 'boolean') return [];
  return [typeof child === 'number' ? String(child) : child];
};

/** An element's `children` as the element holds them: the flat, normalised list. */
export function childrenFrom(children: unknown): readonly TreeChild[] {
  // The elements are the caller's: a malformed child is the shape check's to report.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- children are checked when the tree is validated
  return [children].flat(Infinity).flatMap(normalised) as readonly TreeChild[];
}
