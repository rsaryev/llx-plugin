/**
 * `ui.resolve`.
 * plugins/mods/reference.md § Interface (`ui.resolve`: "Mods load, once for each app, render site,
 * and mod. The result is the element table that `$.ui.resolve(e)` reads"); plugins/mods/interface.md
 * § Build a tree from elements (`const { Box, Text, Button } = $.ui.resolve(e)`). The kit resolves
 * the tables; which elements an app really draws is the app's. The fields of the event are the kit's
 * wording (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fakeInterface, recordOf, uiOver, renderOf } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

spec('mods.event.ui.resolve', () => {
  const setup = async () => {
    const { iface } = fakeInterface();
    return apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
    });
  };

  test('mods load: ui.resolve fires once for each app, render site and mod, with the three in the event', async () => {
    const h = await setup();
    const seen: unknown[] = [];
    await h.mod('watcher', 'prepend', [fn('ui.resolve', (_$, e, next) => (seen.push(e), next(e)))]);
    await h.ui?.loadMod('my-mod');
    expect(seen).toHaveLength(3 * 15);
    expect(new Set(seen.map((e) => JSON.stringify(e))).size).toBe(45);
    expect(seen[0]).toMatchObject({ plugin: 'my-mod', surface: 'terminal', component: 'Pane' });
  });

  test('$.ui.resolve(e) reads the table for the app of the event, at once and without await', async () => {
    const h = await setup();
    await h.ui?.loadMod('my-mod');
    const terminal = h.api.ui.resolve(renderOf('Pane', 'terminal'));
    const desktop = h.api.ui.resolve(renderOf('Pane', 'desktop'));
    expect(Object.keys(terminal)).toContain('Raster');
    expect(Object.keys(desktop)).not.toContain('Raster');
    expect(Object.keys(desktop)).toContain('Svg');
    expect(terminal.Text?.({ children: ['hi'] })).toEqual({
      type: 'Text',
      props: {},
      children: ['hi'],
    });
  });

  test('the result of a ui.resolve hook is the table $.ui.resolve(e) reads for that mod', async () => {
    const h = await setup();
    await h.mod('policy', 'prepend', [
      fn('ui.resolve', async (_$, e, next) => {
        if (e.plugin !== 'my-mod') return next(e);
        const table = await next(e);
        const { Raster: _dropped, ...rest } = recordOf(table);
        return rest;
      }),
    ]);
    await h.ui?.loadMod('my-mod');
    await h.ui?.loadMod('other-mod');
    expect(Object.keys(h.api.ui.resolve(renderOf('Pane', 'terminal')))).not.toContain('Raster');
    const other = await h.mod('other-mod', 'user', []);
    expect(Object.keys(other.api.ui.resolve(renderOf('Pane', 'terminal')))).toContain('Raster');
  });

  test('a ui.resolve hook that returns something that is not an element table is skipped as the wrong shape', async () => {
    const h = await setup();
    await h.mod('bad', 'prepend', [fn('ui.resolve', () => ({ Box: 'not a function' }))]);
    await h.ui?.loadMod('my-mod');
    expect(h.reports[0]?.line).toBe(
      'bad: ui.resolve hook skipped: returned the wrong shape (ui.resolve result: "Box" is not an element function)',
    );
    expect(Object.keys(h.api.ui.resolve(renderOf('Pane', 'terminal')))).toContain('Box');
  });
});
