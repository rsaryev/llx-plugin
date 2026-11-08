/**
 * Focus, scrolling, `Client` messages and faults, pane closing.
 * plugins/mods/reference.md § Interface (`ui.focus`, `ui.scroll`: "The focused control or the scroll
 * position of a pane or the band is about to change"; `ui.close`: `e.origin.kind` is `plugin`,
 * `person`, or `unload`; `ui.message`; `ui.fault`: `e.phase` and `e.reason`); plugins/mods/interface.md
 * § Redraw a site (`ui.fault`: "Claude Code runs the hook once more after your `ui.fault` hooks
 * return"). When Claude Code raises these is the host's: the kit proves the event each carries, the
 * order around the redraw, and what a hook can keep from happening. The data of `ui.message` and
 * the fields of a focus or scroll change are the kit's wording (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

const uiHarness = async () => {
  const { iface, calls } = fakeInterface();
  const h = await apiHarness({
    rules: withUiRules,
    ui: uiOver(iface),
  });
  return { h, calls, ui: h.ui };
};

spec(['mods.event.ui.focus', 'mods.event.ui.scroll'], () => {
  test('when the focus or the scroll position is about to change the hook sees the change, and what it leaves is applied', async () => {
    const { h, ui } = await uiHarness();
    const seen: unknown[] = [];
    await h.mod('watch', 'user', [
      fn('ui.focus', (_$, e, next) => (seen.push(['focus', e]), next(e))),
      fn('ui.scroll', (_$, e, next) => (seen.push(['scroll', e]), next({ ...e, offset: 0 }))),
    ]);
    const applied: unknown[] = [];
    await ui?.change('ui.focus', { requestId: 'p', key: 'more' }, (e) => applied.push(e));
    await ui?.change('ui.scroll', { requestId: 'p', offset: 7 }, (e) => applied.push(e));
    expect(seen).toEqual([
      ['focus', { requestId: 'p', key: 'more' }],
      ['scroll', { requestId: 'p', offset: 7 }],
    ]);
    expect(applied).toEqual([
      { requestId: 'p', key: 'more' },
      { requestId: 'p', offset: 0 },
    ]);
  });

  test('a hook that answers without calling next keeps the change from happening', async () => {
    const { h, ui } = await uiHarness();
    await h.mod('pin', 'user', [fn('ui.focus', () => ({}))]);
    const applied: unknown[] = [];
    await ui?.change('ui.focus', { key: 'more' }, (e) => applied.push(e));
    expect(applied).toEqual([]);
  });
});

spec('mods.event.ui.message', () => {
  test('data a Client posts reaches the hooks of its mod as a ui.message event', async () => {
    const { h, ui } = await uiHarness();
    const seen: unknown[] = [];
    await h.mod('my-mod', 'user', [
      fn('ui.message', (_$, e, next) => (seen.push(e.data), next(e))),
    ]);
    await ui?.message({ clicked: 3 });
    expect(seen).toEqual([{ clicked: 3 }]);
  });
});

spec('mods.event.ui.fault', () => {
  test('a Client that failed fires ui.fault with its phase and reason, then the site is drawn once more after the hooks return', async () => {
    const { iface, calls } = fakeInterface();
    const h = await apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
    });
    const order: string[] = [];
    await h.mod('my-mod', 'user', [
      fn('ui.fault', async (_$, e, next) => {
        order.push(`hook ${String(e.phase)}: ${String(e.reason)}`);
        await Promise.resolve();
        order.push(`hook done, redraws so far ${calls.filter((c) => c.name === 'redraw').length}`);
        return next(e);
      }),
    ]);
    await h.ui?.fault({ phase: 'load', reason: 'boom' });
    expect(order).toEqual(['hook load: boom', 'hook done, redraws so far 0']);
    expect(calls.filter((c) => c.name === 'redraw')).toHaveLength(1);
  });

  test('the phase is load, render or run', async () => {
    const { h } = await uiHarness();
    const seen: unknown[] = [];
    await h.mod('my-mod', 'user', [fn('ui.fault', (_$, e, next) => (seen.push(e.phase), next(e)))]);
    for (const phase of ['load', 'render', 'run'] as const) {
      await h.ui?.fault({ phase, reason: 'x' });
    }
    expect(seen).toEqual(['load', 'render', 'run']);
  });
});

spec('mods.event.ui.close', () => {
  const open = async () => {
    const ctx = await uiHarness();
    await ctx.h.api.ui.open({ id: 'hello-tabs', title: 'Hello tabs' });
    return ctx;
  };

  test('the person closing a pane fires ui.close with its id and origin.kind person', async () => {
    const { h, ui } = await open();
    const seen: unknown[] = [];
    await h.mod('watch', 'user', [fn('ui.close', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(await ui?.panes.close('hello-tabs', 'person')).toBe(true);
    expect(seen).toEqual([{ id: 'hello-tabs', origin: { kind: 'person' } }]);
    expect(ui?.panes.list()).toEqual([]);
  });

  test('a mod`s own $.ui.close has origin.kind plugin, and unloading a mod closes its panes with unload', async () => {
    const { h, ui } = await open();
    const kinds: unknown[] = [];
    await h.mod('watch', 'prepend', [
      fn('ui.close', (_$, e, next) => (kinds.push((e.origin as { kind: string }).kind), next(e))),
    ]);
    await h.api.ui.open({ id: 'second' });
    await h.api.ui.close({ id: 'second' });
    await ui?.panes.unload('my-mod');
    expect(kinds).toEqual(['plugin', 'unload']);
    expect(ui?.panes.list()).toEqual([]);
  });

  test('a hook that answers without calling next keeps the pane open', async () => {
    const { h, ui } = await open();
    await h.mod('keep', 'user', [fn('ui.close', () => ({}))]);
    expect(await ui?.panes.close('hello-tabs', 'person')).toBe(false);
    expect(ui?.panes.list()).toHaveLength(1);
  });
});
