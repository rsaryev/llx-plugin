import { isElementName, type ElementNode, type Props } from './node.ts';
import { elementFn, type ElementFn } from './table.ts';

/** A tag JSX compiles to: an element's name, one of its constructors, or a component of the mod's. */
export type JsxTag = string | ElementFn | ((props: never) => unknown);

const isComponent = (tag: JsxTag): tag is (props: Props) => unknown => typeof tag === 'function';

/**
 * The JSX factory (claude-code/index.d.ts:16460, `h`): "a plain-data element from a string tag or a
 * component". A string tag names an element and builds it with that element's constructor; a
 * function tag, a constructor from `$.ui.resolve(e)` or a component, is called with the props and
 * `children`. The children reach the element flat and normalised (`RenderChildren`, :10224).
 */
export function h(tag: JsxTag, props: Props | null | undefined, ...children: unknown[]): unknown {
  const given: Props = children.length === 0 ? { ...props } : { ...props, children };
  if (isComponent(tag)) return tag(given);
  if (!isElementName(tag)) throw new Error(`h: "${String(tag)}" is not an element`);
  return elementFn(tag)(given);
}

/** `<>...</>` (claude-code/index.d.ts:16469): "a column Box around the children". */
export const Fragment = (props: { readonly children?: unknown }): ElementNode =>
  elementFn('Box')({ flexDirection: 'column', children: props.children });
