/**
 * The `engine.create` event: a mod changes the mods API another mod receives.
 * plugins/mods/reference.md § Other mods ("`engine.create`: The mods API is being built for this
 * mod. A hook can return: A changed mods API, to add a namespace. A mod outside the `user` tier can
 * also withhold one."; "When another mod's hook calls a method on a namespace you added in
 * `engine.create`, your method's `$` calls run in that hook's context until every hook on that
 * event returns. For example, a relative path resolves against that hook's working directory,
 * and `$.prompt.submit` rejects while the turn is waiting on that hook").
 */
import { expect, test } from 'bun:test';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

type Api = Awaited<ReturnType<typeof apiHarness>>['api'];

/** A mod whose `engine.create` hook adds `widgets` to every API built after it. */
const widgets = (extra: (api: Api) => Record<string, unknown> = () => ({})) =>
  fn('engine.create', async ($, _e, next) => ({
    ...record(await next({})),
    widgets: { hello: () => 'hello from widgets', ...extra($) },
  }));

const fsPort = (reads: string[]) => ({
  read: (path: string) => (reads.push(path), Promise.resolve({ text: path, bytes: path.length })),
  write: () => Promise.resolve(),
  list: () => Promise.resolve([]),
  stat: () => Promise.resolve(undefined),
  exists: () => Promise.resolve(true),
  ancestors: () => Promise.resolve([]),
});

spec('mods.event.engine.create', () => {
  test('next(e) resolves to the mods API built for the mod, with every namespace of the reference', async () => {
    const built: string[][] = [];
    const h = await apiHarness();
    await h.mod('watcher', 'prepend', [
      fn(
        'engine.create',
        async (_$, e, next) => (built.push(Object.keys(record(await next(e)))), next(e)),
      ),
    ]);
    await h.mod('b', 'user', []);
    expect(built).toEqual([Object.keys(MODS_API)]);
  });

  test('a hook that returns a changed API adds a namespace to the mod $', async () => {
    const h = await apiHarness();
    await h.mod('adder', 'user', [widgets()]);
    const b = await h.mod('b', 'user', []);
    expect(Object.keys(b.api)).toEqual([...Object.keys(MODS_API), 'widgets']);
    expect(await Reflect.get(b.api, 'widgets').hello()).toBe('hello from widgets');
  });

  test('the namespaces it built are still there and work', async () => {
    const h = await apiHarness({
      ports: { store: { read: () => Promise.resolve({ k: 1 }), write: () => Promise.resolve() } },
    });
    await h.mod('adder', 'user', [widgets()]);
    const b = await h.mod('b', 'user', []);
    expect(await b.api.store.get('k')).toBe(1);
  });

  test('a mod outside the user tier can withhold a namespace', async () => {
    const h = await apiHarness({ options: { canWithhold: true } });
    await h.mod('org-policy', 'prepend', [
      fn('engine.create', async (_$, e, next) => {
        const { process: _p, http: _h, ...rest } = record(await next(e));
        return rest;
      }),
    ]);
    const b = await h.mod('b', 'user', []);
    expect(Object.keys(b.api)).not.toContain('process');
    expect(Object.keys(b.api)).not.toContain('http');
    expect(Object.keys(b.api)).toContain('fs');
  });

  test('a mod in the user tier cannot: the namespace it leaves out is back', async () => {
    const h = await apiHarness({ options: { canWithhold: false } });
    await h.mod('overreach', 'user', [
      fn('engine.create', async (_$, e, next) => {
        const { fs: _fs, ...rest } = record(await next(e));
        return rest;
      }),
    ]);
    const b = await h.mod('b', 'user', []);
    expect(Object.keys(b.api)).toContain('fs');
  });

  test('a method of an added namespace runs its $ calls in the context of the hook that called it: a relative path resolves against that hook working directory', async () => {
    const reads: string[] = [];
    const h = await apiHarness({ ports: { fs: fsPort(reads) } });
    const a = await h.mod('adder', 'user', []);
    // The adder lends a method that reads a relative path with its own `$`.
    await h.mod('lender', 'user', [
      widgets(() => ({ readNotes: () => a.api.fs.read('notes.md') })),
    ]);
    const b = await h.mod('b', 'user', []);
    await b.scope.within(
      { origin: { plugin: 'b', tier: 'user' }, reentry: { plugin: 'b' }, cwd: '/agent' },
      () => Reflect.get(b.api, 'widgets').readNotes(),
    );
    expect(reads).toEqual(['/agent/notes.md']);
    // Outside the lent call the adder calls run in its own context again.
    await a.api.fs.read('notes.md');
    expect(reads.at(-1)).toBe('/work/notes.md');
  });

  test('$.prompt.submit rejects while the turn is waiting on that hook', async () => {
    const submitted: unknown[] = [];
    const prompts = {
      submit: (p: unknown) => (submitted.push(p), Promise.resolve({})),
      read: () => Promise.resolve({ text: '', cursor: 0 }),
      fill: () => Promise.resolve({ isFilled: true }),
      suggest: () => Promise.resolve({ isShown: true }),
      compose: () => Promise.resolve([]),
    };
    const h = await apiHarness({ ports: { prompts } });
    const a = await h.mod('adder', 'user', []);
    await h.mod('lender', 'user', [
      widgets(() => ({ speak: () => a.api.prompt.submit({ text: 'hi' }) })),
    ]);
    const b = await h.mod('b', 'user', []);
    expect(await rejection(Reflect.get(b.api, 'widgets').speak())).toContain(
      'the turn is waiting on a hook of b',
    );
    expect(submitted).toEqual([]);
    await a.api.prompt.submit({ text: 'later' });
    expect(submitted).toEqual([{ text: 'later', from: 'adder' }]);
  });

  test('an answer that is no object leaves the API as built', async () => {
    const h = await apiHarness();
    await h.mod('odd', 'user', [fn('engine.create', () => 'nothing')]);
    const b = await h.mod('b', 'user', []);
    expect(Object.keys(b.api)).toEqual(Object.keys(MODS_API));
  });
});
