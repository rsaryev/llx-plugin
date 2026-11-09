import {
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

function elementFn(name: ElementName): ElementFn {
  const def = ELEMENT_DEFS[name];
  return (given = {}) => {
    def.construct?.(given);
    const { children, ...props } = given;
    return { type: name, props, children: childrenFrom(children) };
  };
}

/**
 * The elements `surface` draws (the check marks of the elements table). Judgment: an element the
 * app cannot draw is left out of the table, so using it fails at once in the hook, as calling
 * `undefined` does, instead of drawing nothing.
 */
export function defaultElementTable(surface: UiSurface): ElementTable {
  return Object.fromEntries(
    ELEMENT_NAMES.filter((name) => ELEMENT_SURFACES[name].includes(surface)).map((name) => [
      name,
      elementFn(name),
    ]),
  );
}
