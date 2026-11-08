/**
 * plugins/mods/overview.md § Turn mods on or off ("One mod": disable or uninstall its plugin turns
 * its mod off, and the rest keep running; undoing the change turns it back on). The rules of loading a
 * mod after `load` ran (its place in the order, the guard, a name that is held, a second load of the
 * same plugin) and the idempotent unload are judgments of the kit (spec/judgments.md), tested outside
 * `spec(...)`.
 */
import { expect, test } from 'bun:test';
import { wire } from '../../../src/mods/load/wiring.ts';
import { loadMod } from '../../../src/mods/load/loader.ts';
import { orderOne } from '../../../src/mods/load/order.ts';
import type { ModsHost } from '../../../src/mods/load/index.ts';
import { fakeModInterface, fakePorts, inlineRuntime } from '../../../src/testing/mods/index.ts';
import type { ModRuntime } from '../../../src/mods/ports.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  registerOf,
  runtimeOf,
  session,
  textCompiler,
} from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

type Next = (e: unknown) => Promise<unknown>;

/** A module whose `tool.call` hook adds its name to the answer, so the order mods ran in is the answer. */
const naming = (label: string, seen: string[] = []) =>
  registerOf((on) => {
    on('tool.call', async (_$: unknown, e: unknown, next: Next) => {
      seen.push(label);
      return next(e);
    });
  });

const call = (host: ModsHost) => host.fire('tool.call', { tool: 'Bash' });

spec('mods.overview.Turn mods on or off.One mod', () => {
  test('turning one mod off stops its hooks and leaves the others running; it stays off after a reload', async () => {
    const seen: string[] = [];
    const { host } = session({ a: naming('a', seen), b: naming('b', seen) });
    await host.load([
      modPlugin(inline('a'), naming('a', seen)),
      modPlugin(inline('b'), naming('b', seen)),
    ]);
    await call(host);
    expect(seen).toEqual(['a', 'b']);
    seen.length = 0;
    expect(await host.unloadMod('a')).toBe(true);
    await call(host);
    expect(seen).toEqual(['b']);
    expect(host.active().map((mod) => mod.name)).toEqual(['b']);
    seen.length = 0;
    await host.reload();
    await call(host);
    expect(seen).toEqual(['b']);
  });

  test('undoing the change turns it back on: the mod loads again and its hooks run', async () => {
    const seen: string[] = [];
    const { host } = session({ a: naming('a', seen), b: naming('b', seen) });
    const a = modPlugin(inline('a'), naming('a', seen));
    await host.load([a, modPlugin(inline('b'), naming('b', seen))]);
    await host.unloadMod('a');
    seen.length = 0;
    const report = await host.loadMod(a);
    expect(report.lines).toEqual([]);
    expect(host.active().map((mod) => mod.name)).toEqual(['b', 'a']);
    await call(host);
    expect(seen).toEqual(['b', 'a']);
  });
});

test('judgment: load called twice with the same plugin replaces the mod: one copy, its hooks run once', async () => {
  const seen: string[] = [];
  const { host } = session({ a: naming('a', seen) });
  const a = modPlugin(inline('a'), naming('a', seen));
  await host.load([a]);
  const report = await host.load([a]);
  expect(report.loaded.map((mod) => mod.name)).toEqual(['a']);
  expect(host.active()).toHaveLength(1);
  await call(host);
  expect(seen).toEqual(['a']);
});

test('judgment: a second load starts the replaced mod over: session.start fires for it again', async () => {
  const starts: number[] = [];
  const watch = registerOf((on) => {
    on('session.start', () => {
      starts.push(starts.length);
      return {};
    });
  });
  const { host } = session({ a: watch });
  const a = modPlugin(inline('a'), watch);
  await host.load([a]);
  await host.load([a]);
  expect(starts).toEqual([0, 1]);
});

test('judgment: a mod that fails to load in place of the one before says the version loaded before is unloaded', async () => {
  const good = registerOf((on) => void on);
  const bad = registerOf(() => {
    throw new Error('boom');
  });
  let current = good;
  const { host } = session({ a: (on, options) => current(on, options) });
  const a = modPlugin(inline('a'), good);
  await host.load([a]);
  current = bad;
  const report = await host.load([a]);
  expect(report.loaded).toEqual([]);
  expect(report.lines[0]).toContain('hooks module did not load');
  expect(report.lines[0]).toEndWith('; the version loaded before is unloaded');
});

test('judgment: unloadMod is idempotent and says whether it unloaded anything', async () => {
  const { host } = session({ a: naming('a') });
  await host.load([modPlugin(inline('a'), naming('a'))]);
  expect(await host.unloadMod('a')).toBe(true);
  expect(await host.unloadMod('a')).toBe(false);
  expect(await host.unloadMod('never-loaded')).toBe(false);
});

test('judgment: the mod`s own unload runs the runtime`s dispose once, however often it is called', async () => {
  let disposed = 0;
  const counting: ModRuntime = {
    load: async (input, signal) => {
      const loaded = await inlineRuntime(naming('a')).load(input, signal);
      const guest = loaded.module;
      if (!guest) return loaded;
      return {
        ...loaded,
        module: {
          hooks: guest.hooks,
          dispose: async () => {
            disposed += 1;
            await guest.dispose();
          },
        },
      };
    },
  };
  const { host } = session({}, { runtime: counting });
  const report = await host.load([modPlugin(inline('a'), naming('a'))]);
  const [mod] = report.loaded;
  await mod?.unload();
  await mod?.unload();
  expect(disposed).toBe(1);
});

test('judgment: unloading a mod drops it from the approval ledger and the refusal book', async () => {
  const wired = wire({
    ports: fakePorts().ports,
    iface: fakeModInterface(),
    runtime: runtimeOf({ a: naming('a') }),
    compiler: textCompiler,
    policy: policy(),
    deny: { verdict: () => Promise.resolve('none') },
    debug: () => undefined,
    report: () => undefined,
    signal: new AbortController().signal,
  });
  const plugin = modPlugin(inline('a'), naming('a'));
  const { mod } = await loadMod(
    wired.env,
    { candidate: plugin.candidate, tier: 'user' },
    plugin.files,
  );
  wired.env.ledger.approvers.push('a', 'other');
  wired.env.book.refusers.set('reason a', 'a');
  wired.env.book.refusers.set('reason other', 'other');
  await mod?.unload();
  expect(wired.env.ledger.approvers).toEqual(['other']);
  expect([...wired.env.book.refusers]).toEqual([['reason other', 'other']]);
});

test('judgment: a mod loaded after load runs last in its tier, and a tier the policy gives it comes first', async () => {
  const seen: string[] = [];
  const { host } = session(
    { a: naming('a', seen), b: naming('b', seen), acme: naming('acme', seen) },
    { policy: managed({ prependPlugins: ['acme@acme-tools'] }) },
  );
  await host.load([modPlugin(installed('a'), naming('a', seen))]);
  await host.loadMod(modPlugin(installed('b'), naming('b', seen)));
  await host.loadMod(modPlugin(organizations('acme'), naming('acme', seen)));
  await call(host);
  expect(seen).toEqual(['acme', 'a', 'b']);
});

test('judgment: a mod the policy lists before one already loaded runs after it, and a line says so', async () => {
  const settings = managed({ appendPlugins: ['acme-z@acme-tools', 'acme-y@acme-tools'] });
  const seen: string[] = [];
  const { host } = session(
    { 'acme-y': naming('y', seen), 'acme-z': naming('z', seen) },
    { policy: settings },
  );
  await host.load([modPlugin(organizations('acme-y'), naming('y', seen))]);
  const report = await host.loadMod(modPlugin(organizations('acme-z'), naming('z', seen)));
  expect(report.lines).toEqual([
    'appendPlugins lists acme-z@acme-tools before acme-y@acme-tools, which is already loaded: acme-z runs after it',
  ]);
  await call(host);
  expect(seen).toEqual(['y', 'z']);
});

test('judgment: loadMod loads the built-in guard first when policy needs it, so the first mod is refused like any other', async () => {
  const settings = managed({
    pluginConfigs: {
      'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
    },
  });
  const { host } = session({ a: naming('a') }, { policy: settings });
  const report = await host.loadMod(modPlugin(installed('a'), naming('a')));
  expect(report.lines).toEqual([
    "a: refused by cc-plugin-sec-default: mods are limited to your organization's by policy (allowManagedModsOnly)",
  ]);
  expect(host.active().map((mod) => mod.name)).toEqual(['cc-plugin-sec-default']);
  await host.load([modPlugin(installed('b'), naming('b'))]);
  expect(host.active().filter((mod) => mod.name === 'cc-plugin-sec-default')).toHaveLength(1);
});

test('judgment: the built-in guard cannot be turned off with unloadMod', async () => {
  const { host } = session({}, { policy: managed() });
  await host.load([]);
  expect(host.active().map((mod) => mod.name)).toEqual(['cc-plugin-sec-default']);
  expect(await host.unloadMod('cc-plugin-sec-default')).toBe(false);
  expect(host.active()).toHaveLength(1);
});

test('judgment: a name another loaded plugin holds is refused with the documented line, and a copy managed settings enable takes the name over', async () => {
  const seen: string[] = [];
  const settings = managed({});
  let copy = 'one';
  const { host } = session(
    { same: (on, options) => naming(copy, seen)(on, options) },
    { policy: settings },
  );
  await host.load([modPlugin(installed('same', 'one'), naming('one', seen))]);
  const refused = await host.loadMod(modPlugin(installed('same', 'two'), naming('two', seen)));
  expect(refused.lines).toEqual([
    'hooks module same@two not loaded: another plugin of that name loads first',
  ]);
  copy = 'org';
  const takeover = await host.loadMod(modPlugin(organizations('same'), naming('org', seen)));
  expect(takeover.loaded.filter((mod) => !mod.isBuiltin).map((mod) => mod.id)).toEqual([
    'same@acme-tools',
  ]);
  await call(host);
  expect(seen).toEqual(['org']);
});

test('judgment: orderOne answers the tier of a single plugin against the loaded set', () => {
  const settings = managed({ prependPlugins: ['acme@acme-tools'] });
  const loaded = [installed('a')];
  expect(orderOne(settings, loaded, organizations('acme'))).toMatchObject({
    mod: { tier: 'prepend' },
  });
  expect(orderOne(settings, loaded, installed('b'))).toMatchObject({ mod: { tier: 'user' } });
  expect(orderOne(policy({ isTrusted: false }), loaded, installed('b'))).toMatchObject({
    skipped: { reason: expect.stringContaining('not trusted') },
  });
});
