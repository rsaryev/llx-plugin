import { SPACING_STEPS, type Surface } from '../../../protocol/mods-ui-names.ts';
import { isSpacingStep } from './box.ts';

/** Terminal cells a spacing value is across and down. */
export interface SpacingCells {
  readonly across: number;
  readonly down: number;
}

const DOWN_ONLY = /^(rowGap|(padding|margin)(Top|Bottom|Y))$/;
const ACROSS_ONLY = /^(columnGap|(padding|margin)(Left|Right|X))$/;

/**
 * The cells a spacing prop of a `Box` takes: a number is that many cells along each axis the prop
 * names (`gap: 1` and `padding: 1` both ways, `columnGap` across, `paddingTop` down); a step name is its cells, and `gap`, `padding` and `margin` set to a step "apply across
 * and down at once" (reference.md, "`Box` spacing steps"). The table is the terminal's and the VS
 * Code extension's; the Desktop app's cells are its own, so the answer there is `undefined`
 * (judgment: the docs give the cells for the two apps only).
 */
export function spacingCells(
  surface: Surface,
  prop: string,
  value: number | keyof typeof SPACING_STEPS,
): SpacingCells | undefined {
  if (isSpacingStep(value) && surface === 'desktop') return undefined;
  const cells = isSpacingStep(value) ? SPACING_STEPS[value] : { across: value, down: value };
  if (DOWN_ONLY.test(prop)) return { across: 0, down: cells.down };
  if (ACROSS_ONLY.test(prop)) return { across: cells.across, down: 0 };
  return cells;
}
