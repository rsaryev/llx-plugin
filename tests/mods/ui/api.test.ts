/**
 * `$.ui`.
 * plugins/mods/reference.md § Mods API methods (`$.ui`: resolve, invalidate, open, close, panes,
 * focus, scroll, toast, notify, status, log, notice, ask, copy, selection, blit), § Mods API calls
 * ("A hook on one intercepts calls from the mods that run after it, and can return `next(e)`,
 * `{ deny: reason }`, or `{ value }`"); plugins/mods/api.md § Show something without starting a turn
 * (status, toast, log, notify and its `{ isSent, channel }` and `{ isSent: false, reason }`);
 * plugins/mods/events.md § Guard or change a tool call (`$.ui.ask`: a typed answer comes back as the
 * typed text, a dismissed question rejects), plugins/mods/test.md § Look up what a stub returns (the
 * question reaches mods as a `tool.call` of `AskUserQuestion`). The kit proves the namespace,
 * the event each call fires and what reaches the port; nothing here claims anything is drawn,
 * audible or copied. The arguments of notice, blit, focus and scroll are the host's
 * (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { rejection } from '../../support/rejection.ts';
import { fakeInterface, recordOf, uiOver } from '../../support/mods-ui.ts';
import { spec } from '../../support/spec.ts';
import type { ModInterface } from '../../../src/mods/ui/index.ts';

async function setup(overrides: Partial<ModInterface> = {}, plugin = 'my-mod') {
  const { iface, calls } = fakeInterface(overrides);
  const h = await apiHarness({
    plugin,
    rules: withUiRules,
    ui: uiOver(iface),
  });
  const called = (name: string) => calls.filter((c) => c.name === name);
  return { h, calls, called };
}

// test.md, "Look up what a stub returns": the question reaches mods as a tool.call of AskUserQuestion.
const stub = (answer: (question: string) => string | undefined) =>
  fn('tool.call', (_$, e, next) => {
    if (e.tool !== 'AskUserQuestion') return next(e);
    const question = String(recordOf(Array.isArray(e.questions) ? e.questions[0] : {}).question);
    const given = answer(question);
    return given === undefined
      ? { result: { answers: {} } }
      : { result: { answers: { [question]: given } } };
  });

spec('mods.api.$.ui', () => {
  test('$.ui has exactly the methods of the reference table', async () => {
    const { h } = await setup();
    expectMethods(h.api.ui, MODS_API.ui);
    expect(Object.keys(h.api.ui)).toHaveLength(16);
  });

  test('$.ui.status puts one line under the prompt that starts with the warning sign and the mod`s name', async () => {
    const { h, called } = await setup({}, 'my-mod');
    await h.api.ui.status('checks: 3 passing');
    expect(called('status')[0]?.args).toEqual(['⚠ my-mod: checks: 3 passing']);
  });

  test('$.ui.log adds a dim transcript line that starts with the bullet and the mod`s name', async () => {
    const { h, called } = await setup({}, 'my-mod');
    await h.api.ui.log('build finished');
    expect(called('log')[0]?.args).toEqual(['● my-mod: build finished']);
  });

  test('$.ui.notify uses the mod`s name as its title unless a non-empty { title } is passed, shown as given', async () => {
    const { h, called } = await setup({}, 'my-mod');
    await h.api.ui.notify('Turn finished');
    await h.api.ui.notify('Turn finished', { title: 'Custom Title ' });
    await h.api.ui.notify('Turn finished', { title: '' });
    expect(called('notify').map((c) => c.args[0])).toEqual([
      { text: 'Turn finished', title: 'my-mod' },
      { text: 'Turn finished', title: 'Custom Title ' },
      { text: 'Turn finished', title: 'my-mod' },
    ]);
  });

  test('$.ui.notify is refused when another mod`s hook answered in Claude Code`s place without sending, and rejects on { deny }', async () => {
    const { h, called } = await setup();
    await h.mod('quiet', 'prepend', [
      fn('ui.notify', (_$, e, next) =>
        e.text === 'secret'
          ? { deny: 'no' }
          : e.text === 'mine'
            ? { value: { isSent: true, channel: 'x' } }
            : next(e),
      ),
    ]);
    expect(await h.api.ui.notify('mine')).toEqual({ isSent: false, reason: 'refused' });
    expect(called('notify')).toHaveLength(0);
    expect(await rejection(h.api.ui.notify('secret'))).toContain('no');
    expect(await rejection(h.api.ui.notify(3))).toContain('$.ui.notify');
  });

  describe('$.ui.ask', () => {
    test('the question reaches mods as a tool.call of AskUserQuestion with the question and the options, and the answer is read from result.answers', async () => {
      const { h, called } = await setup();
      const seen: unknown[] = [];
      await h.mod('stub', 'prepend', [
        fn(
          'tool.call',
          (_$, e) => (seen.push(e), { result: { answers: { 'Run this command? ls': 'Run it' } } }),
        ),
      ]);
      expect(await h.api.ui.ask('Run this command? ls', ['Run it', 'Refuse'])).toBe('Run it');
      expect(seen).toMatchObject([
        {
          tool: 'AskUserQuestion',
          questions: [
            {
              question: 'Run this command? ls',
              options: [{ label: 'Run it' }, { label: 'Refuse' }],
            },
          ],
        },
      ]);
      expect(called('ask')).toHaveLength(0);
    });

    test('a typed answer comes back as the typed text', async () => {
      const { h } = await setup();
      await h.mod('stub', 'prepend', [stub(() => 'something else')]);
      expect(await h.api.ui.ask('Run it?', ['Run it', 'Refuse'])).toBe('something else');
    });

    test('with no hook answering, the dialog of the host is asked with the question and the options', async () => {
      const { h, called } = await setup();
      await h.api.ui.ask('Which?', ['a', 'b']);
      expect(called('ask')[0]?.args).toEqual([{ question: 'Which?', options: ['a', 'b'] }]);
    });

    test('it rejects when the question is dismissed or Chat about this is picked: the host rejects, or no answer comes back', async () => {
      const dismissed = await setup({ ask: () => Promise.reject(new Error('dismissed')) });
      expect(await rejection(dismissed.h.api.ui.ask('q', ['a']))).toBe('dismissed');
      const chat = await setup();
      await chat.h.mod('stub', 'prepend', [stub(() => undefined)]);
      expect(await rejection(chat.h.api.ui.ask('q', ['a']))).toContain('$.ui.ask');
    });

    test('a call that is not a question is passed on by a stub that checks e.tool', async () => {
      const { h } = await setup();
      await h.mod('stub', 'prepend', [stub(() => 'x')]);
      expect(await rejection(h.api.ui.ask(3, []))).toContain('$.ui.ask');
    });
  });

  test('$.ui.copy, $.ui.selection, $.ui.notice, $.ui.blit, $.ui.focus and $.ui.scroll reach the host with what the hooks left', async () => {
    const { h, called } = await setup();
    await h.api.ui.copy('text');
    await h.api.ui.selection();
    await h.api.ui.blit({ requestId: 'heat', key: 'grid', columns: 3, rows: 2, cells: 'AAAA' });
    await h.api.ui.focus({ id: 'hello-tabs' });
    await h.api.ui.scroll({ id: 'hello-tabs', offset: 4 });
    await h.api.ui.notice({ text: 'n' });
    expect(called('copy')[0]?.args).toEqual(['text']);
    expect(called('selection')).toHaveLength(1);
    expect(called('blit')[0]?.args).toEqual([
      { requestId: 'heat', key: 'grid', columns: 3, rows: 2, cells: 'AAAA' },
    ]);
    expect(called('focus')[0]?.args).toEqual([{ id: 'hello-tabs' }]);
    expect(called('scroll')[0]?.args).toEqual([{ id: 'hello-tabs', offset: 4 }]);
    expect(called('notice')[0]?.args).toEqual([{ text: 'n' }]);
  });

  test('each call is an event named ns.method: a hook before the mod sees it, can rewrite it with next, or refuse it with { deny }', async () => {
    const { h, called } = await setup();
    const seen: unknown[] = [];
    await h.mod('spy', 'prepend', [
      fn(
        'ui.status',
        (_$, e, next) => (seen.push(['status', e]), next({ ...e, text: 'rewritten' })),
      ),
      fn('ui.log', (_$, e) => (seen.push(['log', e]), { deny: 'logs are off' })),
      fn('ui.copy', (_$, e, next) => (seen.push(['copy', e]), next(e))),
    ]);
    await h.api.ui.status('original');
    expect(await rejection(h.api.ui.log('x'))).toContain('logs are off');
    await h.api.ui.copy('c');
    expect(seen).toEqual([
      ['status', { text: 'original' }],
      ['log', { text: 'x' }],
      ['copy', { text: 'c' }],
    ]);
    expect(called('status')[0]?.args).toEqual(['⚠ my-mod: rewritten']);
    expect(called('log')).toHaveLength(0);
  });

  test('$.ui.panes lists the panes that are open', async () => {
    const { h } = await setup();
    await h.api.ui.open({ id: 'one', title: 'One' });
    await h.api.ui.open({ id: 'two' });
    expect(await h.api.ui.panes()).toEqual([
      { id: 'one', title: 'One', isPlaced: true },
      { id: 'two', title: undefined, isPlaced: true },
    ]);
    await h.api.ui.close({ id: 'one' });
    expect(await h.api.ui.panes()).toEqual([{ id: 'two', title: undefined, isPlaced: true }]);
  });

  test('$.ui.invalidate takes ui.render, and nothing else', async () => {
    const { h, called } = await setup();
    await h.api.ui.invalidate('ui.render');
    expect(called('redraw')).toHaveLength(1);
    expect(await rejection(h.api.ui.invalidate('ui.other'))).toBe(
      "$.ui.invalidate: takes 'ui.render'",
    );
  });

  test('$.ui.resolve(e) needs the event of a ui.render hook', async () => {
    const { h } = await setup();
    expect(() => h.api.ui.resolve({})).toThrow('$.ui.resolve: takes the event of a ui.render hook');
    expect(() => h.api.ui.resolve({ component: 'Nope', surface: 'terminal' })).toThrow();
  });
});
