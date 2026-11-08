/**
 * The size limits of a tree.
 * plugins/mods/reference.md § Limits (the rows for a `Code`'s `language` or `path`, a `Select`
 * option's `value`, a `Client`'s `module`; a `Link`'s `href`; text, nesting depth, elements and text
 * children, `Raster` cells and `Image` bytes in one tree); plugins/mods/troubleshoot.md § A pane or
 * band is empty, § A `ui.render` line says `refused`. The kit measures and refuses a tree; what an
 * app then draws is the app's: no test claims a pixel.
 */
import { expect, test } from 'bun:test';
import {
  clipText,
  foldRender,
  measureTree,
  sizeProblem,
  treeProblem,
  type ElementNode,
} from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { node, renderOf, text, uiChain } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const problemOf = (tree: unknown) => treeProblem('Pane', 'terminal', tree);

/** A Box with `levels` Boxes nested below it. */
function nested(levels: number): ElementNode {
  let tree = node('Box');
  for (let level = 0; level < levels; level += 1) tree = node('Box', { children: [tree] });
  return tree;
}

const textOf = (tree: ElementNode): string =>
  tree.children
    .map((child) => (typeof child === 'string' ? child : 'children' in child ? textOf(child) : ''))
    .join('');

spec('mods.limit.Code', () => {
  test('a Code language or path, a Select option value and a Client module go up to 10,000 characters', () => {
    const fits = 'x'.repeat(10_000);
    const over = 'x'.repeat(10_001);
    expect(problemOf(node('Code', { source: 's', language: fits, path: fits }))).toBeUndefined();
    expect(problemOf(node('Select', { key: 's', options: [{ value: fits }] }))).toBeUndefined();
    expect(problemOf(node('Client', { module: fits }))).toBeUndefined();
    expect(problemOf(node('Code', { source: 's', language: over }))).toBe(
      'a tree Pane refuses: Code prop "language" is longer than 10000 characters',
    );
    expect(problemOf(node('Code', { source: 's', path: over }))).toContain('Code prop "path"');
    expect(problemOf(node('Select', { key: 's', options: [{ value: over }] }))).toContain(
      'Select option "value" is longer than 10000',
    );
    expect(problemOf(node('Client', { module: over }))).toContain('Client prop "module"');
  });

  test('the ui.render hook that returned a longer one fails: it is skipped as having returned the wrong shape', async () => {
    const h = uiChain();
    h.mod('my-mod', 'user', [
      fn('ui.render', () => node('Code', { source: 's', path: 'p'.repeat(10_001) })),
    ]);
    const result = await h.fire('ui.render', renderOf('Pane'), {
      core: () => Promise.resolve('engine'),
    });
    expect(result).toBe('engine');
    expect(h.reports.map((r) => r.line)).toEqual([
      'my-mod: ui.render hook skipped: returned the wrong shape (a tree Pane refuses: Code prop "path" is longer than 10000 characters)',
    ]);
  });
});

spec('mods.limit.Link', () => {
  test('a Link href goes up to 2,048 characters and the ui.render hook that returned a longer one fails', async () => {
    const link = (length: number) =>
      node('Link', { href: `https://e.com/${'a'.repeat(length - 14)}` });
    expect(problemOf(link(2048))).toBeUndefined();
    expect(problemOf(link(2049))).toBe(
      'a tree Pane refuses: Link prop "href" is longer than 2048 characters',
    );
    const h = uiChain();
    h.mod('my-mod', 'user', [fn('ui.render', () => link(2049))]);
    await h.fire('ui.render', renderOf('Pane'), { core: () => Promise.resolve('engine') });
    expect(h.reports[0]?.line).toContain('ui.render hook skipped: returned the wrong shape');
  });
});

spec('mods.limit.Raster', () => {
  const raster = (columns: number, rows: number) =>
    node('Raster', { key: `r${columns}x${rows}`, columns, rows });

  test('the cells of all the Rasters in one tree, each its columns times its rows, go up to 262,144', () => {
    const fits = node('Box', {
      children: [raster(512, 256), node('Raster', { key: 'b', columns: 512, rows: 256 })],
    });
    expect(measureTree(fits).rasterCells).toBe(262_144);
    expect(sizeProblem(fits)).toBeUndefined();
    const over = node('Box', {
      children: [
        raster(512, 256),
        node('Raster', { key: 'b', columns: 512, rows: 256 }),
        node('Raster', { key: 'c', columns: 1, rows: 1 }),
      ],
    });
    expect(measureTree(over).rasterCells).toBe(262_145);
    expect(sizeProblem(over)).toBe('Raster cells over 262144; nothing was drawn');
  });

  test('a tree over the limit is not drawn: the site is refused and nothing is drawn', () => {
    const over = node('Box', {
      children: [
        raster(512, 256),
        node('Raster', { key: 'b', columns: 512, rows: 256 }),
        node('Raster', { key: 'c', columns: 1, rows: 1 }),
      ],
    });
    expect(foldRender('Pane', 'terminal', over)).toEqual({
      refused: 'Raster cells over 262144; nothing was drawn',
      line: 'ui.render (Pane) refused: Raster cells over 262144; nothing was drawn',
    });
  });
});

spec('mods.limit.Image', () => {
  const image = (key: string, bytes: number) =>
    node('Image', { key, source: new Uint8Array(bytes) });
  const mib = 1024 * 1024;

  test('the PNG or RGBA bytes of all the Images in one tree go up to 2 MiB', () => {
    const fits = node('Box', { children: [image('a', mib), image('b', mib)] });
    expect(measureTree(fits).imageBytes).toBe(2 * mib);
    expect(sizeProblem(fits)).toBeUndefined();
    const over = node('Box', { children: [image('a', mib), image('b', mib + 1)] });
    expect(sizeProblem(over)).toBe(`Image bytes over ${2 * mib}; nothing was drawn`);
    expect(foldRender('Pane', 'terminal', over)).toMatchObject({ refused: expect.any(String) });
  });
});

spec('mods.limit.Text in one tree', () => {
  test('the first 100,000 characters are drawn: a tree with more is cut, not refused', () => {
    const tree = node('Box', { children: [text('a'.repeat(60_000)), text('b'.repeat(60_000))] });
    const drawn = foldRender('Pane', 'terminal', tree);
    expect('tree' in drawn).toBe(true);
    if (!('tree' in drawn)) return;
    const all = textOf(drawn.tree);
    expect(all).toHaveLength(100_000);
    expect(all.startsWith('a'.repeat(60_000) + 'b')).toBe(true);
    expect(all.endsWith('b')).toBe(true);
  });

  test('a tree of exactly 100,000 characters is drawn whole', () => {
    const tree = node('Box', { children: [text('a'.repeat(100_000))] });
    expect(textOf(clipText(tree))).toHaveLength(100_000);
  });
});

spec('mods.limit.Elements and text children in one tree', () => {
  const flat = (children: number): ElementNode =>
    node('Box', { children: Array.from({ length: children }, () => 'x') });

  test('a tree holds 20,000 elements and text children, and one more is not drawn', () => {
    // the root and 19,999 text children
    expect(measureTree(flat(19_999)).nodes).toBe(20_000);
    expect(sizeProblem(flat(19_999))).toBeUndefined();
    expect(sizeProblem(flat(20_000))).toBe(
      'more than 20000 elements and text children; nothing was drawn',
    );
    expect(foldRender('Pane', 'terminal', flat(20_000))).toMatchObject({
      line: 'ui.render (Pane) refused: more than 20000 elements and text children; nothing was drawn',
    });
  });

  test('elements count with the text children', () => {
    const boxes = node('Box', { children: Array.from({ length: 20_000 }, () => node('Box')) });
    expect(measureTree(boxes).nodes).toBe(20_001);
    expect(sizeProblem(boxes)).toContain('more than 20000');
  });
});

spec('mods.limit.Nesting depth of one tree', () => {
  test('a tree nests 32 levels below the root element, and 33 is not drawn', () => {
    expect(measureTree(nested(32)).depth).toBe(32);
    expect(sizeProblem(nested(32))).toBeUndefined();
    expect(measureTree(nested(33)).depth).toBe(33);
    expect(sizeProblem(nested(33))).toBe('deeper than 32; nothing was drawn');
  });

  test('the refusal line of several mods whose bands nest too deep is the documented one', () => {
    expect(foldRender('AbovePrompt', 'terminal', nested(33), { mods: 2 })).toEqual({
      refused: 'deeper than 32; nothing was drawn',
      line: 'hooks: ui.render (AbovePrompt) refused: deeper than 32; nothing was drawn',
    });
    expect(foldRender('AbovePrompt', 'terminal', nested(33))).toMatchObject({
      line: 'ui.render (AbovePrompt) refused: deeper than 32; nothing was drawn',
    });
  });

  test('a ui.render hook may return a tree nested past 28,000 levels: the tree is refused as a drawing, the hook does not fail', async () => {
    const deep = nested(30_000);
    const h = uiChain();
    h.mod('my-mod', 'user', [fn('ui.render', () => deep)]);
    const settled = await h.fire('ui.render', renderOf('Pane'), {
      core: () => Promise.resolve('engine'),
    });
    expect(settled).toBe(deep);
    expect(h.reports).toEqual([]);
    expect(foldRender('Pane', 'terminal', settled)).toMatchObject({
      refused: 'deeper than 32; nothing was drawn',
    });
  });
});
