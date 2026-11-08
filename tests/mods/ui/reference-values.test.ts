/**
 * plugins/mods/reference.md § Box border styles, § Box spacing steps. These are the values a host
 * renderer receives from the kit's element model, not claims about terminal pixels.
 */
import { expect, test } from 'bun:test';
import { borderOf, spacingCells, treeProblem } from '../../../src/mods/ui/index.ts';
import { node } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const borders = [
  'single',
  'double',
  'round',
  'bold',
  'singleDouble',
  'doubleSingle',
  'classic',
  'arrow',
  'dashed',
  'quote',
] as const;

for (const border of borders) {
  spec(`mods.reference.Box border styles.'${border}'`, () => {
    test('the documented style is accepted by a Box and selected for the renderer', () => {
      expect(treeProblem('Pane', 'terminal', node('Box', { borderStyle: border }))).toBeUndefined();
      expect(borderOf({ borderStyle: border })).toBe(border);
    });
  });
}

const steps = [
  ['xs', 1, 0],
  ['sm', 1, 0],
  ['md', 2, 1],
  ['lg', 3, 1],
  ['xl', 4, 2],
] as const;

for (const [step, across, down] of steps) {
  spec(`mods.reference.Box spacing steps.'${step}'`, () => {
    test('gap, margin and padding use the documented cells on both supported cell renderers', () => {
      for (const surface of ['terminal', 'vscode'] as const) {
        for (const property of ['gap', 'margin', 'padding'] as const) {
          expect(spacingCells(surface, property, step)).toEqual({ across, down });
        }
        expect(spacingCells(surface, 'paddingX', step)).toEqual({ across, down: 0 });
        expect(spacingCells(surface, 'paddingY', step)).toEqual({ across: 0, down });
      }
    });
  });
}
