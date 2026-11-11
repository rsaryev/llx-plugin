/**
 * plugins/mods/reference.md, "Other mods": methods added by engine.create run in the borrowing
 * hook's context; prompt.submit rejects while its turn waits on that hook. These public helpers
 * let a host supply its own API ports without reimplementing settlement or admission.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { expect, test } from 'bun:test';
import { runScopedModCall, settleModApi } from '../../../src/entry/mods.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';
import { createScope } from '../../../src/mods/api/scope.ts';

const scopeFor = (plugin: string) =>
  createScope({ origin: { plugin, tier: 'user' }, reentry: { plugin } });

spec('mods.event.engine.create', () => {
  test('host-backed prompt submission is refused in a lent call, then works in its own scope', async () => {
    const { api } = await apiHarness();
    const scope = scopeFor('reader');
    const lender = scopeFor('lender');
    let submits = 0;
    const submit = () => runScopedModCall(lender, 'prompt.submit', () => ++submits);
    const settled = settleModApi(
      api,
      { ...api, widgets: { send: submit } },
      {
        plugin: 'reader',
        scope,
        scopes: new Map([
          ['reader', scope],
          ['lender', lender],
        ]),
        canWithhold: false,
      },
    );
    expect(await rejection(Reflect.get(settled, 'widgets').send())).toContain(
      'the turn is waiting on a hook of reader',
    );
    expect(submits).toBe(0);
    expect(submit()).toBe(1);
  });

  test('an admitted host call sees the borrowing context and restores the lender afterward', async () => {
    const { api } = await apiHarness();
    const scope = scopeFor('reader');
    const lender = scopeFor('lender');
    const current = () => runScopedModCall(lender, 'fs.read', () => lender.current());
    const settled = settleModApi(
      api,
      { ...api, widgets: { current } },
      {
        plugin: 'reader',
        scope,
        scopes: new Map([
          ['reader', scope],
          ['lender', lender],
        ]),
        canWithhold: false,
      },
    );
    expect(await Reflect.get(settled, 'widgets').current()).toMatchObject({
      reentry: { plugin: 'reader' },
      lentTo: 'reader',
    });
    expect(current().reentry).toEqual({ plugin: 'lender' });
  });
});

// Judgment, a known limit: without async context (src/ may not import node:async_hooks) a scope is
// one stack per mod, so a call the lending mod makes on its own while a lent method waits runs in
// the borrowing context too. Once the lent method settles, the mod's own context is back.
test('known limit: while a lent method waits, the lending mod`s other calls see the borrowing context', async () => {
  const lender = scopeFor('lender');
  const borrowed = {
    origin: { plugin: 'reader', tier: 'user' as const },
    reentry: { plugin: 'reader' },
    lentTo: 'reader',
  };
  const gate = Promise.withResolvers<void>();
  const waiting = lender.within(borrowed, () => gate.promise);
  expect(lender.current().lentTo).toBe('reader');
  gate.resolve();
  await waiting;
  expect(lender.current()).toEqual({
    origin: { plugin: 'lender', tier: 'user' },
    reentry: { plugin: 'lender' },
  });
});

test('with the host`s async context, the lending mod`s own calls keep its context while a lent method waits', async () => {
  const lender = createScope(
    { origin: { plugin: 'lender', tier: 'user' }, reentry: { plugin: 'lender' } },
    () => new AsyncLocalStorage(),
  );
  const borrowed = {
    origin: { plugin: 'reader', tier: 'user' as const },
    reentry: { plugin: 'reader' },
    lentTo: 'reader',
  };
  const gate = Promise.withResolvers<void>();
  const seenInside = Promise.withResolvers<string | undefined>();
  const waiting = lender.within(borrowed, async () => {
    seenInside.resolve(lender.current().lentTo);
    await gate.promise;
    return lender.current().lentTo;
  });
  expect(lender.current().lentTo).toBeUndefined();
  expect(await seenInside.promise).toBe('reader');
  gate.resolve();
  expect(await waiting).toBe('reader');
});
