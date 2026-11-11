import { isBox } from '../elements/box.ts';
import { isEngineRef, walkTree, type ElementNode } from '../elements/node.ts';

/**
 * The props a `Box` around the result of `next(e)` may not have in the band: "don't give that `Box`,
 * or any `Box` around it, a `width`, `height`, `minWidth`, `minHeight`, `position`, `top`, `left`,
 * `right`, `bottom`, `display`, or `overflow` prop" (troubleshoot.md, "Another mod's band shows
 * and yours doesn't").
 */
const BAND_FORBIDDEN_PROPS = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'display',
  'overflow',
] as const;

/**
 * Why a band tree is invalid, or `undefined`: a `Box` that holds, at any depth, what `isInner` says
 * is another mod's drawing (the result of `next(e)`) has a forbidden prop. The wording is the kit's.
 */
export function bandProblem(
  tree: unknown,
  isInner: (node: unknown) => boolean,
): string | undefined {
  const parents = new Map<unknown, ElementNode | undefined>();
  const inner: unknown[] = [];
  for (const { node, parent } of walkTree(tree)) {
    parents.set(node, parent);
    if (node !== tree && (isEngineRef(node) || isInner(node))) inner.push(node);
  }
  for (const start of inner) {
    for (let at = parents.get(start); at; at = parents.get(at)) {
      const bad = isBox(at)
        ? BAND_FORBIDDEN_PROPS.find((prop) => at.props[prop] !== undefined)
        : undefined;
      if (bad !== undefined) {
        return `Box prop "${bad}" is not allowed around the result of next(e) in the band`;
      }
    }
  }
  return undefined;
}
