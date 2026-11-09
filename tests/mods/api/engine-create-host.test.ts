/**
 * plugins/mods/reference.md, "Other mods": methods added by engine.create run in the borrowing
 * hook's context; prompt.submit rejects while its turn waits on that hook. These public helpers
 * let a host supply its own API ports without reimplementing settlement or admission.
 */
import { expect, test } from 'bun:test';
import { createScope, runScopedModCall, settleModApi } from '../../../src/entry/mods.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

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
      reentry: { plugin: 'reader', lent: true },
      lentTo: 'reader',
    });
    expect(current().reentry).toEqual({ plugin: 'lender' });
  });
});
