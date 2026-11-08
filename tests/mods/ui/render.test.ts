/**
 * `ui.render` and `ui.resolve`.
 * plugins/mods/interface.md § Pick where to draw (the band: "A tree replaces what the mods after
 * yours draw there. To keep theirs, put the result of `await next(e)` among the children of a
 * `Box`"), § Change what Claude Code already draws ("Change a detail", "Replace the drawing", "Leave
 * it alone", `{ type: 'engine', ref }`, the question dialog), § Build a tree from elements;
 * plugins/mods/reference.md § Interface, § Render sites; plugins/mods/troubleshoot.md § Another mod's
 * band shows and yours doesn't, § A pane or band is empty. The kit folds the result; it paints nothing.
 */
import { expect, test } from 'bun:test';
import { foldRender, isElementNode, isEngineRef, withUiRules } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import {
  fakeInterface,
  node,
  recordOf,
  renderOf,
  text,
  uiChain,
  uiOver,
} from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const BAND = "mods.troubleshoot.Another mod's band shows and yours doesn't";
const EMPTY = "mods.troubleshoot.A pane or band is empty or shows Claude Code's usual content";
const engine = (e: unknown) => Promise.resolve({ type: 'engine', ref: e });

spec(['mods.event.ui.render', 'mods.site.Spinner'], () => {
  test('a tree returned without calling next replaces Claude Code`s drawing, and the engine does not run', async () => {
    const h = uiChain();
    const tree = text('Claude has made 2 tool calls');
    h.mod('my-mod', 'user', [fn('ui.render', () => tree, { matcher: { component: 'Spinner' } })]);
    const settled = await h.fire('ui.render', renderOf('Spinner'), { core: engine });
    expect(settled).toBe(tree);
    expect(h.reports).toEqual([]);
    expect(foldRender('Spinner', 'terminal', settled)).toEqual({ tree });
  });

  test('"Change a detail": next gets a copy with changed props and the engine draws with them', async () => {
    const h = uiChain();
    h.mod('my-mod', 'user', [
      fn(
        'ui.render',
        (_$, e, next) =>
          next({ ...e, props: { ...recordOf(e.props), suffix: ' · tool calls: 2…' } }),
        { matcher: { component: 'Spinner' } },
      ),
    ]);
    const settled = await h.fire(
      'ui.render',
      renderOf('Spinner', 'terminal', { word: 'Thinking', suffix: '' }),
      {
        core: engine,
      },
    );
    expect(isEngineRef(settled)).toBe(true);
    expect(settled).toMatchObject({
      type: 'engine',
      ref: { props: { word: 'Thinking', suffix: ' · tool calls: 2…' } },
    });
    expect(foldRender('Spinner', 'terminal', settled)).toMatchObject({ engine: settled });
  });

  test('"Leave it alone": next(e) leaves the site as Claude Code draws it, with the props as they were', async () => {
    const h = uiChain();
    h.mod('my-mod', 'user', [fn('ui.render', (_$, e, next) => next(e))]);
    const event = renderOf('Spinner', 'terminal', { word: 'Thinking' });
    const settled = await h.fire('ui.render', event, { core: engine });
    expect(settled).toMatchObject({ type: 'engine', ref: event });
  });

  test('next(e) resolves to the reference to Claude Code`s drawing unless a mod after returned a tree, which it resolves to', async () => {
    const h = uiChain();
    const seen: unknown[] = [];
    h.mod('first', 'user', [
      fn('ui.render', async (_$, e, next) => (seen.push(await next(e)), next(e))),
    ]);
    await h.fire('ui.render', renderOf('Spinner'), { core: engine });
    expect(seen[0]).toMatchObject({ type: 'engine' });
    const theirs = text('theirs');
    h.mod('second', 'user', [fn('ui.render', () => theirs)]);
    seen.length = 0;
    await h.fire('ui.render', renderOf('Spinner'), { core: engine });
    expect(seen[0]).toBe(theirs);
  });

  test('the reference can be placed in a Box beside elements of the mod`s own, and is kept in the drawing', async () => {
    const h = uiChain();
    h.mod('my-mod', 'user', [
      fn('ui.render', async (_$, e, next) =>
        node('Box', {
          flexDirection: 'column',
          children: [await next(e), text('under the spinner')],
        }),
      ),
    ]);
    const settled = await h.fire('ui.render', renderOf('Spinner'), { core: engine });
    const drawn = foldRender('Spinner', 'terminal', settled);
    expect(
      'tree' in drawn && drawn.tree.children.map((c) => (isEngineRef(c) ? 'engine' : 'own')),
    ).toEqual(['engine', 'own']);
  });
});

spec(['mods.event.ui.render', BAND, EMPTY], () => {
  test('a tree that does not validate fails the hook: the line is the documented one and the next handler runs in its place', async () => {
    const h = uiChain();
    h.mod('first-mod', 'user', [
      fn('ui.render', () => node('Text', { bogusProp: 1, children: ['x'] }), {
        matcher: { component: 'Pane' },
      }),
    ]);
    const settled = await h.fire('ui.render', renderOf('Pane'), { core: engine });
    expect(h.reports.map((r) => r.line)).toEqual([
      'first-mod: ui.render hook skipped: returned the wrong shape (a tree Pane refuses: Text prop "bogusProp" is not allowed)',
    ]);
    expect(isEngineRef(settled)).toBe(true);
  });

  test('a Box with a flexDirection outside the four gives the other documented line', async () => {
    const h = uiChain();
    h.mod('first-mod', 'user', [fn('ui.render', () => node('Box', { flexDirection: 'diagonal' }))]);
    await h.fire('ui.render', renderOf('Pane'), { core: engine });
    expect(h.reports[0]?.line).toBe(
      'first-mod: ui.render hook skipped: returned the wrong shape (a tree Pane refuses: Box prop "flexDirection" must be one of row, column, row-reverse, column-reverse)',
    );
  });

  test('a result that is not an element tree is the wrong shape too', async () => {
    for (const result of [undefined, 'text', { deny: 'no' }, [node('Text')]]) {
      const h = uiChain();
      h.mod('first-mod', 'user', [fn('ui.render', () => result)]);
      await h.fire('ui.render', renderOf('Pane'), { core: engine });
      expect(h.reports[0]?.line).toContain('returned the wrong shape (a tree Pane refuses:');
    }
  });

  test('the tree is judged for the app that draws it: a Raster in a Desktop app tree fails the hook', async () => {
    const h = uiChain();
    h.mod('first-mod', 'user', [
      fn('ui.render', () => node('Raster', { key: 'g', columns: 1, rows: 1 })),
    ]);
    await h.fire('ui.render', renderOf('Pane', 'desktop'), { core: engine });
    expect(h.reports[0]?.line).toContain('Raster is not drawn by the desktop app');
    h.reports.length = 0;
    await h.fire('ui.render', renderOf('Pane', 'terminal'), { core: engine });
    expect(h.reports).toEqual([]);
  });

  test('a tree is drawn as the app draws it: the VS Code extension leaves out the props it ignores', () => {
    const tree = node('Box', {
      width: 4,
      position: 'absolute',
      children: [node('Button', { key: 'b', label: 'Go', hotkey: 'a' })],
    });
    const drawn = foldRender('Pane', 'vscode', tree);
    expect('tree' in drawn).toBe(true);
    if (!('tree' in drawn)) return;
    expect(drawn.tree.props).toEqual({ width: 4 });
    const [button] = drawn.tree.children;
    expect(isElementNode(button) && button.props).toEqual({ key: 'b', label: 'Go' });
  });
});

spec('mods.site.AskUserQuestion', () => {
  const ref = { type: 'engine', ref: { question: 'q' } } as const;

  test('a tree that holds the reference exactly once is drawn, with the mod`s elements above it', () => {
    const tree = node('Box', { children: [text('above'), ref] });
    expect(foldRender('AskUserQuestion', 'terminal', tree)).toMatchObject({
      tree: { type: 'Box' },
    });
  });

  test('a tree without the reference, or with it twice, leaves the dialog to Claude Code', () => {
    const none = foldRender(
      'AskUserQuestion',
      'terminal',
      node('Box', { children: [text('only mine')] }),
    );
    expect(none).toEqual({ engine: undefined });
    const twice = foldRender('AskUserQuestion', 'terminal', node('Box', { children: [ref, ref] }));
    expect(twice).toEqual({ engine: ref });
  });

  test('a site that has no such rule draws a tree without the reference', () => {
    expect(foldRender('Spinner', 'terminal', text('mine'))).toMatchObject({
      tree: { type: 'Text' },
    });
  });
});

spec('mods.site.AbovePrompt', () => {
  test('a mod that answers ui.render without calling next is named in the debug log: <mod> (<tier>) answered ui.render without next()', async () => {
    const h = await apiHarness({ rules: withUiRules, ui: uiOver(fakeInterface().iface) });
    await h.mod('dropper', 'user', [
      fn('ui.render', async (_$, e, next) => (await next(e), text('x'))),
    ]);
    await h.mod('other-mod', 'user', [fn('ui.render', () => text('theirs'))]);
    await h.ui?.draw({ site: 'AbovePrompt', surface: 'terminal', requestId: 'id-1' });
    expect(h.debug).toEqual(['other-mod (user) answered ui.render without next()']);
  });

  const band = (component = 'AbovePrompt' as const) => renderOf(component);

  test('a mod before replaces the band of the mods after it when its tree does not hold the result of next(e)', async () => {
    const h = uiChain();
    let laterRan = false;
    const mine = text('mine');
    h.mod('before', 'user', [fn('ui.render', () => mine)]);
    h.mod('after', 'user', [fn('ui.render', () => ((laterRan = true), text('theirs')))]);
    const settled = await h.fire('ui.render', band(), { core: engine });
    expect(settled).toBe(mine);
    expect(laterRan).toBe(false);
  });

  test('putting the result of await next(e) among the children of a Box keeps the bands after it', async () => {
    const h = uiChain();
    const theirs = text('theirs');
    h.mod('before', 'user', [
      fn('ui.render', async (_$, e, next) =>
        node('Box', { flexDirection: 'column', children: [text('mine'), await next(e)] }),
      ),
    ]);
    h.mod('after', 'user', [fn('ui.render', () => theirs)]);
    const settled = await h.fire('ui.render', band(), { core: engine });
    expect(h.reports).toEqual([]);
    expect(isElementNode(settled) && settled.children[1]).toBe(theirs);
  });

  test('a Box around that result with width, height, minWidth, minHeight, position, top, left, right, bottom, display or overflow makes the tree invalid, and the other mods bands stay', async () => {
    const forbidden = {
      width: 10,
      height: 2,
      minWidth: 1,
      minHeight: 1,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      overflow: 'hidden',
    };
    for (const [prop, value] of Object.entries(forbidden)) {
      const h = uiChain();
      const theirs = text('theirs');
      h.mod('before', 'user', [
        fn('ui.render', async (_$, e, next) =>
          node('Box', { [prop]: value, children: [await next(e)] }),
        ),
      ]);
      h.mod('after', 'user', [fn('ui.render', () => theirs)]);
      const settled = await h.fire('ui.render', band(), { core: engine });
      expect(settled).toBe(theirs);
      expect(h.reports.map((r) => r.reason)).toEqual([
        expect.stringContaining(
          'returned the wrong shape (Box prop "' + prop + '" is not allowed around',
        ),
      ]);
    }
  });

  test('the same holds for any Box around it, not only the nearest, and a Box that holds none of it may have those props', async () => {
    const h = uiChain();
    h.mod('before', 'user', [
      fn('ui.render', async (_$, e, next) =>
        node('Box', {
          children: [
            node('Box', { width: 3, children: [text('side')] }),
            node('Box', { children: [await next(e)] }),
          ],
        }),
      ),
    ]);
    h.mod('after', 'user', [fn('ui.render', () => text('theirs'))]);
    await h.fire('ui.render', band(), { core: engine });
    expect(h.reports).toEqual([]);
    const h2 = uiChain();
    h2.mod('before', 'user', [
      fn('ui.render', async (_$, e, next) =>
        node('Box', { children: [node('Box', { overflow: 'hidden', children: [await next(e)] })] }),
      ),
    ]);
    h2.mod('after', 'user', [fn('ui.render', () => text('theirs'))]);
    await h2.fire('ui.render', band(), { core: engine });
    expect(h2.reports).toHaveLength(1);
  });

  test('the engine`s own reference nested in the band is held to the same rule', async () => {
    const h = uiChain();
    h.mod('before', 'user', [
      fn('ui.render', async (_$, e, next) => node('Box', { width: 5, children: [await next(e)] })),
    ]);
    await h.fire('ui.render', band(), { core: engine });
    expect(h.reports).toHaveLength(1);
  });
});
