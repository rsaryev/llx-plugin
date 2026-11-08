import { firstProblem, sized, textOf, type ElementDef } from './def.ts';
import type { ElementNode, Props } from './node.ts';

/** An `Image`'s `columns` and `rows` go up to 255 (reference.md, "Elements"). */
const IMAGE_MAX_CELLS = 255;

export const IMAGE: ElementDef = {
  name: 'Image',
  props: ['key', 'source', 'columns', 'rows', 'alt'],
  children: 'none',
  check: (props) =>
    firstProblem(
      sized('Image', props, 'columns', IMAGE_MAX_CELLS),
      sized('Image', props, 'rows', IMAGE_MAX_CELLS),
      textOf('Image', props, 'alt'),
    ),
};

/** Whether `node` is an `Image`. */
export const isImage = (node: ElementNode): boolean => node.type === IMAGE.name;

/**
 * The PNG or RGBA bytes an `Image` holds. Judgment: the docs name "PNG or RGBA bytes ... or a file
 * path" as sources; bytes are a `Uint8Array`, and a string is a file path whose bytes the kit does
 * not see, so it counts none.
 */
export const imageBytes = (props: Props): number =>
  props.source instanceof Uint8Array ? props.source.length : 0;
