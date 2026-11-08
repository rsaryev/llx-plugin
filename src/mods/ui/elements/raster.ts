import { firstProblem, sized, textOf, type ElementDef } from './def.ts';
import type { ElementNode, Props } from './node.ts';

/** A `Raster`'s `columns` go up to 512 and its `rows` up to 256 (reference.md, "Elements"). */
const RASTER_MAX_COLUMNS = 512;
const RASTER_MAX_ROWS = 256;

export const RASTER: ElementDef = {
  name: 'Raster',
  props: ['key', 'columns', 'rows', 'cells'],
  children: 'none',
  check: (props) =>
    firstProblem(
      sized('Raster', props, 'columns', RASTER_MAX_COLUMNS),
      sized('Raster', props, 'rows', RASTER_MAX_ROWS),
      textOf('Raster', props, 'cells'),
    ),
};

/** Whether `node` is a `Raster`. */
export const isRaster = (node: ElementNode): boolean => node.type === RASTER.name;

/** The cells a `Raster` holds: `columns` times `rows`, 0 when either is not a number. */
export function rasterCells(props: Props): number {
  const { columns, rows } = props;
  return typeof columns === 'number' && typeof rows === 'number' ? columns * rows : 0;
}
