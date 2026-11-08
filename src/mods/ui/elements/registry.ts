import type { ElementName } from '../../../protocol/mods-ui-names.ts';
import { BOX } from './box.ts';
import { BUTTON } from './button.ts';
import { CLIENT } from './client.ts';
import { CODE } from './code.ts';
import type { ElementDef } from './def.ts';
import { IMAGE } from './image.ts';
import { INPUT } from './input.ts';
import { LINK } from './link.ts';
import { MARKDOWN } from './markdown.ts';
import { RASTER } from './raster.ts';
import { SELECT } from './select.ts';
import { SVG } from './svg.ts';
import { TEXT } from './text.ts';

/** The elements, one definition each: typed over the union, so a new element fails the typecheck until it has one. */
export const ELEMENT_DEFS: { readonly [N in ElementName]: ElementDef } = {
  Box: BOX,
  Text: TEXT,
  Button: BUTTON,
  Link: LINK,
  Code: CODE,
  Markdown: MARKDOWN,
  Input: INPUT,
  Select: SELECT,
  Svg: SVG,
  Client: CLIENT,
  Raster: RASTER,
  Image: IMAGE,
};
