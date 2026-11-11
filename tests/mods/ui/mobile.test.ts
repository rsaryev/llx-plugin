/**
 * The mobile app, which the docs name only as an app that raises `Backdrop` (reference.md, "Render
 * sites"). The elements table has no column for it; the kit takes it to draw what the Desktop app
 * draws, with the same props (judgment, spec/judgments.md). Tested outside `spec(...)`: a judgment
 * is never compatibility.
 */
import { expect, test } from 'bun:test';
import { ELEMENT_COLUMN_OF, ELEMENT_NAMES } from '../../../src/protocol/mods-ui-names.ts';
import {
  defaultElementTable,
  drawsAsLink,
  renderEvent,
  spacingCells,
  textStyle,
  treeProblem,
} from '../../../src/mods/ui/index.ts';
import { node } from '../../support/mods-ui.ts';
import { drawnProps } from '../../../src/mods/ui/elements/surface.ts';

test('the mobile app draws by the Desktop column of the elements table', () => {
  expect(ELEMENT_COLUMN_OF.mobile).toBe('desktop');
  expect(Object.keys(defaultElementTable('mobile'))).toEqual(
    Object.keys(defaultElementTable('desktop')),
  );
});

test('a tree is refused in the mobile app exactly where the Desktop app refuses it', () => {
  for (const name of ELEMENT_NAMES) {
    const desktop = treeProblem('Backdrop', 'desktop', node(name))?.replace('desktop', 'mobile');
    expect(treeProblem('Backdrop', 'mobile', node(name)), name).toBe(desktop);
  }
  expect(treeProblem('Backdrop', 'mobile', node('Raster'))).toBe(
    'a tree Backdrop refuses: Raster is not drawn by the mobile app',
  );
});

test('the mobile app ignores no prop the VS Code extension ignores, and draws typography', () => {
  const box = node('Box', { position: 'absolute', borderDimColor: true });
  expect(drawnProps('mobile', box)).toEqual(box.props);
  const props = { size: 'title', mono: true, weight: 'bold' };
  expect(textStyle('mobile', props)).toEqual(textStyle('desktop', props));
  expect(textStyle('mobile', props).ignored).toEqual([]);
});

test('a spacing step has no terminal cells in the mobile app, as in the Desktop app', () => {
  expect(spacingCells('mobile', 'gap', 'md')).toBeUndefined();
  expect(spacingCells('mobile', 'paddingTop', 2)).toEqual(spacingCells('desktop', 'paddingTop', 2));
});

test('a Link draws as a link in the mobile app under the Desktop rule', () => {
  for (const href of ['https://example.com', 'http://localhost:3000', 'file:///x', 'a@b.c']) {
    expect(drawsAsLink('mobile', href), href).toBe(drawsAsLink('desktop', href));
  }
  expect(drawsAsLink('mobile', 'file:///x')).toBe(false);
});

test('the mobile app may raise Backdrop before it has measured its window', () => {
  expect(renderEvent({ site: 'Backdrop', surface: 'mobile', requestId: 'backdrop' })).toEqual({
    event: { component: 'Backdrop', surface: 'mobile', props: {}, requestId: 'backdrop' },
  });
});
