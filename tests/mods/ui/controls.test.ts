/**
 * Controls: presses, typing, picking, focus, scrolling, `Client` messages and faults, pane closing.
 * plugins/mods/interface.md § Respond to presses and typing ("Claude Code fires `ui.press`,
 * `ui.input`, or `ui.select` with the control's key in `e.element` before it runs the control's
 * callback. Another mod's hook for that event sees what the user typed into your `Input` and can
 * change that text or keep your callback from running"), § Which controls need a `key`, § Redraw a
 * site (`ui.fault`: "Claude Code runs the hook once more after your `ui.fault` hooks return");
 * plugins/mods/reference.md § Interface (`ui.press`, `ui.input`, `ui.select`, `ui.focus`,
 * `ui.scroll`, `ui.close`: `e.origin.kind` is `plugin`, `person`, or `unload`, `ui.message`,
 * `ui.fault`: `e.phase` and `e.reason`); plugins/mods/troubleshoot.md § `needs a key`... The kit owns
 * the control model; a real keypress, click or scroll is the host's, so no test claims one.
 * The field that holds typed text in the event (`value`) and the data of `ui.message` are the kit's
 * wording (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { routeControl, type RouteOptions } from '../../../src/mods/ui/index.ts';

import { fn } from '../../support/mods-chain.ts';
import { node, uiChain } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';

function setup(tree: unknown) {
  const h = uiChain();
  const options: RouteOptions = {
    chain: h.chain,
    tree,
    surface: 'terminal',
    signal: new AbortController().signal,
    report: (report) => h.reports.push(report),
  };
  return { h, options };
}

spec('mods.event.ui.press', () => {
  test('a press fires ui.press with the key in e.element before the callback runs, then runs it with the app', async () => {
    const order: string[] = [];
    const tree = node('Box', {
      children: [
        node('Button', {
          key: 'more',
          label: 'Add one',
          onPress: (e: unknown) => order.push(`callback ${JSON.stringify(e)}`),
        }),
      ],
    });
    const { h, options } = setup(tree);
    h.mod('watcher', 'user', [
      fn('ui.press', (_$, e, next) => (order.push(`hook ${String(e.element)}`), next(e))),
    ]);
    const routed = await routeControl(options, 'press', 'more');
    expect(routed).toEqual({ issues: [], ran: true });
    expect(order).toEqual(['hook more', 'callback {"surface":"terminal"}']);
  });

  test('another mod`s hook can keep the callback from running by not calling next', async () => {
    let pressed = false;
    const tree = node('Button', { key: 'more', onPress: () => (pressed = true) });
    const { h, options } = setup(tree);
    h.mod('guard', 'user', [fn('ui.press', () => ({}))]);
    expect(await routeControl(options, 'press', 'more')).toEqual({ issues: [], ran: false });
    expect(pressed).toBe(false);
  });

  test('a control is found by its key, a button without one by its label or its single string child', async () => {
    const pressed: string[] = [];
    const tree = node('Box', {
      children: [
        node('Button', { label: 'Save', onPress: () => pressed.push('label') }),
        node('Button', { children: ['Quit'], onPress: () => pressed.push('child') }),
      ],
    });
    const { options } = setup(tree);
    await routeControl(options, 'press', 'Save');
    await routeControl(options, 'press', 'Quit');
    expect(pressed).toEqual(['label', 'child']);
  });

  test('a key that no control has, or that more than one button has, is a PluginIssue and not a throw', async () => {
    const tree = node('Box', {
      children: [
        node('Button', { label: 'Same', onPress: () => undefined }),
        node('Button', { label: 'Same', onPress: () => undefined }),
      ],
    });
    const { options } = setup(tree);
    const missing = await routeControl(options, 'press', 'nope');
    expect(missing.ran).toBe(false);
    expect(missing.issues).toEqual([
      { severity: 'error', path: 'ui.press', message: 'no Button with the key "nope" is drawn' },
    ]);
    const twice = await routeControl(options, 'press', 'Same');
    expect(twice.ran).toBe(false);
    expect(twice.issues[0]?.message).toContain('key each once');
  });

  test('a callback that throws is a PluginIssue and not a throw', async () => {
    const tree = node('Button', {
      key: 'boom',
      onPress: () => {
        throw new Error('boom');
      },
    });
    const { options } = setup(tree);
    const routed = await routeControl(options, 'press', 'boom');
    expect(routed.ran).toBe(true);
    expect(routed.issues.map((issue) => issue.message)).toEqual([
      'the callback of "boom" threw: boom',
    ]);
  });
});

spec('mods.event.ui.input', () => {
  const field = (calls: unknown[]) =>
    node('Input', {
      key: 'new-note',
      onSubmit: (value: unknown) => calls.push(['submit', value]),
      onInput: (value: unknown) => calls.push(['input', value]),
    });

  test('Enter fires ui.input with the key in e.element, then onSubmit gets the text; typing without Enter reaches onInput only', async () => {
    const calls: unknown[] = [];
    const { h, options } = setup(field(calls));
    const seen: unknown[] = [];
    h.mod('watcher', 'user', [fn('ui.input', (_$, e, next) => (seen.push(e.element), next(e)))]);
    await routeControl(options, 'submit', 'new-note', 'buy milk');
    await routeControl(options, 'change', 'new-note', 'buy');
    expect(seen).toEqual(['new-note', 'new-note']);
    expect(calls).toEqual([
      ['submit', 'buy milk'],
      ['input', 'buy'],
    ]);
  });

  test('another mod`s hook sees what was typed and can keep the callback from running', async () => {
    const calls: unknown[] = [];
    const { h, options } = setup(field(calls));
    const typed: unknown[] = [];
    h.mod('guard', 'user', [fn('ui.input', (_$, e) => (typed.push(e.value), {}))]);
    const routed = await routeControl(options, 'submit', 'new-note', 'secret');
    expect(typed).toEqual(['secret']);
    expect(routed.ran).toBe(false);
    expect(calls).toEqual([]);
  });

  test('another mod`s hook can change the typed text before the callback gets it', async () => {
    const calls: unknown[] = [];
    const { h, options } = setup(field(calls));
    h.mod('trim', 'user', [
      fn('ui.input', (_$, e, next) => next({ ...e, value: String(e.value).trim() })),
    ]);
    await routeControl(options, 'submit', 'new-note', '  padded  ');
    expect(calls).toEqual([['submit', 'padded']]);
  });

  test('a text field is addressed by its key: a Button of that key is not it', async () => {
    const { options } = setup(node('Button', { key: 'new-note', onPress: () => undefined }));
    const routed = await routeControl(options, 'submit', 'new-note', 'x');
    expect(routed.issues[0]?.message).toBe('no Input with the key "new-note" is drawn');
  });
});

spec('mods.event.ui.select', () => {
  test('a pick fires ui.select with the key in e.element, then onSelect gets the value picked', async () => {
    const picked: unknown[] = [];
    const tree = node('Select', {
      key: 'size',
      options: [{ value: 'sm' }, { value: 'lg', label: 'Large' }],
      onSelect: (value: unknown) => picked.push(value),
    });
    const { h, options } = setup(tree);
    const seen: unknown[] = [];
    h.mod('watcher', 'user', [fn('ui.select', (_$, e, next) => (seen.push(e.element), next(e)))]);
    await routeControl(options, 'select', 'size', 'lg');
    expect(seen).toEqual(['size']);
    expect(picked).toEqual(['lg']);
  });
});
