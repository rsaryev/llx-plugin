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
import { ELEMENT_NAMES, ELEMENT_SURFACES, SURFACES } from '../../../src/protocol/mods-ui-names.ts';
import {
  borderOf,
  defaultElementTable,
  drawnProps,
  spacingCells,
  textStyle,
  treeProblem,
} from '../../../src/mods/ui/index.ts';
import { sectionsOf, tableRows, codeTokens } from '../../support/mods-docs.ts';
import { node, text } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const problemOf = (tree: unknown, surface: 'terminal' | 'desktop' | 'vscode' = 'terminal') =>
  treeProblem('Pane', surface, tree);

const table = () => {
  const section = sectionsOf(2).find((s) => s.heading === 'Elements');
  return tableRows(section?.lines ?? [], 'Element');
};

spec(
  [
    'mods.element.Box',
    'mods.element.Text',
    'mods.element.Button',
    'mods.element.Link',
    'mods.element.Code',
    'mods.element.Markdown',
    'mods.element.Input',
    'mods.element.Select',
    'mods.element.Svg',
    'mods.element.Client',
    'mods.element.Raster',
    'mods.element.Image',
  ],
  () => {
    test('the elements an app draws are the check marks of the elements table', () => {
      const rows = table();
      expect(rows.map((row) => codeTokens(row[0] ?? '')[0])).toEqual([...ELEMENT_NAMES]);
      for (const row of rows) {
        const name = codeTokens(row[0] ?? '')[0];
        const drawn = SURFACES.filter((_surface, index) => row[2 + index] === '✓');
        expect(ELEMENT_SURFACES[ELEMENT_NAMES.find((n) => n === name) ?? 'Box']).toEqual(drawn);
      }
    });

    test('an element function gives { type, props, children }, and children are not a prop', () => {
      const { Text } = defaultElementTable('terminal');
      expect(Text?.({ color: 'red', children: ['hi'] })).toEqual({
        type: 'Text',
        props: { color: 'red' },
        children: ['hi'],
      });
    });

    test('an element the app cannot draw is absent from its table, and a tree that holds one is refused', () => {
      expect(defaultElementTable('desktop').Raster).toBeUndefined();
      expect(defaultElementTable('vscode').Client).toBeUndefined();
      expect(defaultElementTable('terminal').Svg).toBeUndefined();
      expect(problemOf(node('Raster', { columns: 1, rows: 1 }), 'desktop')).toBe(
        'a tree Pane refuses: Raster is not drawn by the desktop app',
      );
    });

    test('a prop an element does not take fails the tree, with the documented line for a Text', () => {
      expect(problemOf(node('Text', { bogusProp: 1, children: ['x'] }))).toBe(
        'a tree Pane refuses: Text prop "bogusProp" is not allowed',
      );
    });

    test('a child where none goes fails the tree', () => {
      expect(problemOf(node('Markdown', { text: 'x', children: ['y'] }))).toBe(
        'a tree Pane refuses: Markdown takes no children',
      );
      expect(problemOf(node('Input', { key: 'k', children: [text('x')] }))).toContain(
        'Input takes no children',
      );
    });
  },
);

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
    const section = sectionsOf(3, 'Elements').find((s) => s.heading === '`Box` border styles');
    const names = tableRows(section?.lines ?? [], '`borderStyle`').map(
      (row) => codeTokens(row[0] ?? '')[0]?.replaceAll("'", '') ?? '',
    );
    expect(names).toHaveLength(10);
    for (const name of names) expect(String(borderOf({ borderStyle: name }))).toBe(name);
    expect(borderOf({ borderStyle: 'rounded' })).toBeUndefined();
    expect(problemOf(node('Box', { borderStyle: 'rounded' }))).toBeUndefined();
  });

  test('a spacing step is its cells across and down, and applies both ways to gap, padding and margin', () => {
    const steps = { xs: [1, 0], sm: [1, 0], md: [2, 1], lg: [3, 1], xl: [4, 2] } as const;
    for (const surface of ['terminal', 'vscode'] as const) {
      for (const [step, [across, down]] of Object.entries(steps)) {
        expect(spacingCells(surface, 'padding', step as 'md')).toEqual({ across, down });
        expect(spacingCells(surface, 'gap', step as 'md')).toEqual({ across, down });
        expect(spacingCells(surface, 'margin', step as 'md')).toEqual({ across, down });
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
