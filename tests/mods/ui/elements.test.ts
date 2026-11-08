/**
 * The elements of a tree.
 * plugins/mods/reference.md § Elements (the elements table with the apps that draw each, "More
 * `Button` rules", the props the VS Code extension ignores, "`Box` border styles", "`Box` spacing
 * steps", "`Text` typography props", "Replace `bold` with `weight`"); plugins/mods/interface.md §
 * Build a tree from elements ("a prop an element doesn't take or a child where none goes"), §
 * Respond to presses and typing ("Which controls need a `key`", "Set a hotkey and the first focus"),
 * § `Link` in the Desktop app and VS Code; plugins/mods/troubleshoot.md § A pane or band is empty,
 * § `needs a key`, `is drawn twice`. The kit validates and routes a tree; it draws nothing, so no
 * test here claims a pixel or a terminal cell.
 */
import { expect, test } from 'bun:test';
import {
  ELEMENT_NAMES,
  ELEMENT_SURFACES,
  SURFACES,
  type ElementName,
} from '../../../src/protocol/mods-ui-names.ts';
import {
  borderOf,
  defaultElementTable,
  drawnProps,
  spacingCells,
  textStyle,
  treeProblem,
} from '../../../src/mods/ui/index.ts';
import { MODS_REFERENCE } from '../../support/mods-reference.ts';
import { node, text } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const problemOf = (tree: unknown, surface: 'terminal' | 'desktop' | 'vscode' = 'terminal') =>
  treeProblem('Pane', surface, tree);

/** One `spec` block for each element, each asserting what that element's own row of the table says. */
const ELEMENT_IDS = {
  Box: 'mods.element.Box',
  Text: 'mods.element.Text',
  Button: 'mods.element.Button',
  Link: 'mods.element.Link',
  Code: 'mods.element.Code',
  Markdown: 'mods.element.Markdown',
  Input: 'mods.element.Input',
  Select: 'mods.element.Select',
  Svg: 'mods.element.Svg',
  Client: 'mods.element.Client',
  Raster: 'mods.element.Raster',
  Image: 'mods.element.Image',
} as const satisfies Record<ElementName, string>;

for (const name of ELEMENT_NAMES) {
  const row = MODS_REFERENCE.elements.find((candidate) => candidate.name === name);
  const drawn = row?.surfaces ?? [];
  const refused = SURFACES.filter((surface) => !drawn.includes(surface));
  spec(ELEMENT_IDS[name], () => {
    test(`the row of ${name} gives the apps that draw it, and the kit routes it to those`, () => {
      expect(row).toBeDefined();
      expect([...ELEMENT_SURFACES[name]]).toEqual(drawn);
      for (const surface of SURFACES) {
        expect(defaultElementTable(surface)[name] !== undefined, `${name} on ${surface}`).toBe(
          drawn.includes(surface),
        );
      }
    });

    test(`${name} gives { type, props, children } and children are not a prop`, () => {
      const make = defaultElementTable(drawn[0] ?? 'terminal')[name];
      const made = make?.({ children: ['x'] });
      expect(made?.type).toBe(name);
      expect(made?.props).toEqual({});
      expect(made?.children).toEqual(['x']);
    });

    test(`a tree with ${name} is refused on exactly the apps its row leaves unchecked`, () => {
      for (const surface of refused) {
        expect(problemOf(node(name), surface)).toBe(
          `a tree Pane refuses: ${name} is not drawn by the ${surface} app`,
        );
      }
      for (const surface of drawn) {
        expect(problemOf(node(name), surface) ?? '').not.toContain('is not drawn by');
      }
    });

    test(`${name} takes each main prop its row names and refuses one it does not`, () => {
      const props = (row?.props ?? []).filter((prop) => prop !== 'children');
      expect(props.length).toBeGreaterThan(0);
      for (const prop of props) {
        expect(problemOf(node(name, { [prop]: undefined }), drawn[0]) ?? '', prop).not.toContain(
          'is not allowed',
        );
      }
      expect(problemOf(node(name, { bogusProp: 1 }), drawn[0])).toBe(
        `a tree Pane refuses: ${name} prop "bogusProp" is not allowed`,
      );
    });
  });
}

spec('mods.element.Text', () => {
  test('a prop an element does not take fails the tree, with the documented line for a Text', () => {
    expect(problemOf(node('Text', { bogusProp: 1, children: ['x'] }))).toBe(
      'a tree Pane refuses: Text prop "bogusProp" is not allowed',
    );
  });
});

spec('mods.element.Markdown', () => {
  test('a child where none goes fails the tree', () => {
    expect(problemOf(node('Markdown', { text: 'x', children: ['y'] }))).toBe(
      'a tree Pane refuses: Markdown takes no children',
    );
  });
});

spec('mods.element.Input', () => {
  test('a child where none goes fails the tree', () => {
    expect(problemOf(node('Input', { key: 'k', children: [text('x')] }))).toContain(
      'Input takes no children',
    );
  });
});

spec('mods.element.Box', () => {
  test('a Box takes the props of the table: key, layout, spacing, size, border, position, overflow, display, hover', () => {
    const props = {
      key: 'b',
      flexDirection: 'row',
      gap: 1,
      columnGap: 2,
      rowGap: 'md',
      padding: 'sm',
      paddingX: 1,
      margin: 0,
      marginTop: 'xl',
      width: 10,
      height: 3,
      minWidth: 1,
      minHeight: 1,
      borderStyle: 'round',
      borderColor: 'red',
      borderDimColor: true,
      backgroundColor: 'blue',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      display: 'flex',
      hover: {},
    };
    expect(problemOf(node('Box', props))).toBeUndefined();
  });

  test('a flexDirection outside the four fails the tree with the documented line', () => {
    expect(problemOf(node('Box', { flexDirection: 'diagonal' }))).toBe(
      'a tree Pane refuses: Box prop "flexDirection" must be one of row, column, row-reverse, column-reverse',
    );
  });

  test('the ten border styles draw a border, and any other name draws none without failing the tree', () => {
    const names = MODS_REFERENCE.borderStyles;
    expect(names).toHaveLength(10);
    for (const name of names) expect(String(borderOf({ borderStyle: name }))).toBe(name);
    expect(borderOf({ borderStyle: 'rounded' })).toBeUndefined();
    expect(problemOf(node('Box', { borderStyle: 'rounded' }))).toBeUndefined();
  });

  test('a spacing step is its cells across and down, and applies both ways to gap, padding and margin', () => {
    const steps = [
      ['xs', 1, 0],
      ['sm', 1, 0],
      ['md', 2, 1],
      ['lg', 3, 1],
      ['xl', 4, 2],
    ] as const;
    for (const surface of ['terminal', 'vscode'] as const) {
      for (const [step, across, down] of steps) {
        expect(spacingCells(surface, 'padding', step)).toEqual({ across, down });
        expect(spacingCells(surface, 'gap', step)).toEqual({ across, down });
        expect(spacingCells(surface, 'margin', step)).toEqual({ across, down });
      }
    }
    // "`padding: 'md'` is two cells at each side and one row above and below"
    expect(spacingCells('terminal', 'padding', 'md')).toEqual({ across: 2, down: 1 });
  });

  test('a one-axis form takes its axis of the step, and a number is cells', () => {
    expect(spacingCells('terminal', 'paddingX', 'xl')).toEqual({ across: 4, down: 0 });
    expect(spacingCells('terminal', 'marginTop', 'xl')).toEqual({ across: 0, down: 2 });
    expect(spacingCells('terminal', 'columnGap', 'md')).toEqual({ across: 2, down: 0 });
    expect(spacingCells('terminal', 'rowGap', 'md')).toEqual({ across: 0, down: 1 });
    expect(spacingCells('terminal', 'gap', 1)).toEqual({ across: 1, down: 1 });
  });

  test('the VS Code extension ignores position, top, left, right, bottom, alignSelf, borderDimColor and hover', () => {
    const box = node('Box', {
      key: 'b',
      width: 5,
      position: 'absolute',
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      alignSelf: 'center',
      borderDimColor: true,
      hover: {},
    });
    expect(drawnProps('vscode', box)).toEqual({ key: 'b', width: 5 });
    expect(drawnProps('terminal', box)).toEqual(box.props);
  });
});

spec('mods.element.Text', () => {
  test('a Text takes the props of the table', () => {
    const props = {
      color: 'red',
      backgroundColor: 'blue',
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      dimColor: true,
      inverse: true,
      wrap: 'truncate-end',
      size: 'title',
      weight: 'medium',
      mono: true,
      tabular: true,
      hover: {},
      children: ['x'],
    };
    expect(problemOf(node('Text', props))).toBeUndefined();
  });

  test('wrap is one of wrap, truncate, truncate-start, truncate-middle, truncate-end', () => {
    for (const wrap of ['wrap', 'truncate', 'truncate-start', 'truncate-middle', 'truncate-end']) {
      expect(problemOf(node('Text', { wrap }))).toBeUndefined();
    }
    expect(problemOf(node('Text', { wrap: 'clip' }))).toBe(
      'a tree Pane refuses: Text prop "wrap" must be one of wrap, truncate, truncate-start, truncate-middle, truncate-end',
    );
  });

  test('size is one of caption, footnote, body, heading, title and weight one of regular, medium, semibold, bold', () => {
    for (const size of ['caption', 'footnote', 'body', 'heading', 'title']) {
      expect(problemOf(node('Text', { size }))).toBeUndefined();
    }
    for (const weight of ['regular', 'medium', 'semibold', 'bold']) {
      expect(problemOf(node('Text', { weight }))).toBeUndefined();
    }
    expect(problemOf(node('Text', { size: 'huge' }))).toContain('Text prop "size" must be one of');
    expect(problemOf(node('Text', { weight: 'thin' }))).toContain(
      'Text prop "weight" must be one of',
    );
  });

  test('in the terminal and the VS Code extension size, mono and tabular are ignored and semibold and bold draw bold', () => {
    for (const surface of ['terminal', 'vscode'] as const) {
      const props = { size: 'title', mono: true, tabular: true, weight: 'semibold' };
      expect(textStyle(surface, props)).toEqual({
        isBold: true,
        ignored: ['size', 'mono', 'tabular'],
      });
      expect(textStyle(surface, { weight: 'bold' }).isBold).toBe(true);
      expect(textStyle(surface, { weight: 'regular' }).isBold).toBe(false);
      expect(textStyle(surface, { weight: 'medium' }).isBold).toBe(false);
    }
  });

  test('the VS Code extension drops size, mono, tabular and hover from what it draws', () => {
    const drawn = drawnProps(
      'vscode',
      node('Text', { color: 'red', size: 'title', mono: true, tabular: true, hover: {} }),
    );
    expect(drawn).toEqual({ color: 'red' });
  });

  test('bold still works, is the same as weight semibold, and has no effect when weight is set', () => {
    expect(textStyle('terminal', { bold: true }).isBold).toBe(true);
    expect(textStyle('terminal', { bold: true }).isBold).toBe(
      textStyle('terminal', { weight: 'semibold' }).isBold,
    );
    expect(textStyle('terminal', { bold: true, weight: 'regular' }).isBold).toBe(false);
    expect(textStyle('terminal', {}).isBold).toBe(false);
  });
});
