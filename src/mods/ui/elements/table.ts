import {
  ELEMENT_COLUMN_OF,
  ELEMENT_NAMES,
  ELEMENT_SURFACES,
  type ElementName,
  type UiSurface,
} from '../../../protocol/mods-ui-names.ts';
import { childrenFrom } from './children.ts';
import { ELEMENT_DEFS } from './registry.ts';
import type { ElementNode, Props } from './node.ts';

/** One element as `$.ui.resolve(e)` gives it: a function from props (and `children`) to a node. */
export type ElementFn = (props?: Props) => ElementNode;

/** The elements an app draws, by name: an element the app lacks is absent ("Apps other than the terminal have no `Raster`"). */
export type ElementTable = { readonly [N in ElementName]?: ElementFn };

/**
 * JSX gives every tag a `key` (claude-code/index.d.ts:16486, `JSX.IntrinsicAttributes`): an element
 * whose props declare one keeps it as its address; any other takes it and drops it, as the identity
 * hint it is (spec/judgments.md, `jsxKey`).
 */
const ownProps = (takesKey: boolean, props: Props): Props => {
  if (takesKey || !('key' in props)) return props;
  const { key: _hint, ...rest } = props;
  return rest;
};

function construct(name: ElementName): ElementFn {
  const def = ELEMENT_DEFS[name];
  const takesKey = def.props.includes('key');
  return (given = {}) => {
    def.construct?.(given);
    const { children, ...props } = given;
    return { type: name, props: ownProps(takesKey, props), children: childrenFrom(children) };
  };
}

/** One constructor for each element, shared by every table: each is pure, so it is known by its name. */
const CONSTRUCTORS: { readonly [N in ElementName]: ElementFn } = Object.freeze({
  Box: construct('Box'),
  Text: construct('Text'),
  Button: construct('Button'),
  Link: construct('Link'),
  Code: construct('Code'),
  Markdown: construct('Markdown'),
  Input: construct('Input'),
  Select: construct('Select'),
  Svg: construct('Svg'),
  Client: construct('Client'),
  Raster: construct('Raster'),
  Image: construct('Image'),
});
const NAMES: ReadonlyMap<unknown, ElementName> = new Map(
  ELEMENT_NAMES.map((name) => [CONSTRUCTORS[name], name]),
);

/** The constructor of `name`, the one `$.ui.resolve(e)` hands out: what a host rebuilds from a name it got across a boundary. */
export const elementFn = (name: ElementName): ElementFn => CONSTRUCTORS[name];

/**
 * The element `value` builds when it is one of the kit's constructors, else `undefined`. Judgment:
 * the constructors are pure, so a host may hand one across a boundary by this name.
 */
export const elementNameOf = (value: unknown): ElementName | undefined => NAMES.get(value);

/**
 * The elements `surface` draws (the check marks of the elements table). Judgment: an element the
 * app cannot draw is left out of the table, so using it fails at once in the hook, as calling
 * `undefined` does, instead of drawing nothing.
 */
export function defaultElementTable(surface: UiSurface): ElementTable {
  return Object.fromEntries(
    ELEMENT_NAMES.filter((name) => ELEMENT_SURFACES[name].includes(ELEMENT_COLUMN_OF[surface])).map(
      (name) => [name, CONSTRUCTORS[name]],
    ),
  );
}
