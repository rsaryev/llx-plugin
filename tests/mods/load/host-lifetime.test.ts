/**
 * The lifetime of a loaded mod and of the host (judgments of the kit, spec/judgments.md): a host
 * given its own signal still stops its events' work when disposed, and a mod whose host step fails
 * after its hooks registered does not stay half-loaded.
 */
import { expect, test } from 'bun:test';
import { wire } from '../../../src/mods/load/wiring.ts';
import { loadMod } from '../../../src/mods/load/loader.ts';
import { fakeModInterface, fakePorts } from '../../../src/testing/mods/index.ts';
import {
  inline,
  modPlugin,
  policy,
  registerOf,
  runtimeOf,
  session,
  textCompiler,
} from '../../support/mods-load.ts';

type Next = (e: unknown) => Promise<unknown>;

const naming = (label: string, seen: string[] = []) =>
  registerOf((on) => {
    on('tool.call', async (_$: unknown, e: unknown, next: Next) => {
      seen.push(label);
      return next(e);
    });
  });

test('judgment: disposing a host that was given its own signal still stops the work of its events', async () => {
  const given = new AbortController();
  let seen: AbortSignal | undefined;
  const watch = registerOf((on) => {
    on(
      'tool.call',
      async (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown> & object) => {
        seen = Reflect.get(next, 'signal');
        return next(e);
      },
    );
  });
  const { host } = session({ watch }, { signal: given.signal, firesSessionStart: false });
  await host.load([modPlugin(inline('watch'), watch)]);
  await host.fire('tool.call', { tool: 'Bash' });
  expect(seen?.aborted).toBe(false);
  await host.dispose();
  expect(seen?.aborted).toBe(true);
  expect(given.signal.aborted).toBe(false);
});

test('judgment: a mod whose interface step fails after its hooks registered does not load, and its hooks are gone', async () => {
  const seen: string[] = [];
  const wired = wire({
    ports: fakePorts().ports,
    iface: fakeModInterface(),
    runtime: runtimeOf({ a: naming('a', seen) }),
    compiler: textCompiler,
    policy: policy(),
    deny: { verdict: () => Promise.resolve('none') },
    debug: () => undefined,
    report: () => undefined,
    signal: new AbortController().signal,
  });
  const env = { ...wired.env, onLoaded: () => Promise.reject(new Error('ui.resolve broke')) };
  const plugin = modPlugin(inline('a'), naming('a', seen));
  const outcome = await loadMod(env, { candidate: plugin.candidate, tier: 'user' }, plugin.files);
  expect(outcome).toEqual({
    line: 'a: hooks module did not load: ui.resolve broke',
    kind: 'did-not-load',
  });
  await wired.chain.dispatch(
    'tool.call',
    { tool: 'Bash' },
    {
      origin: { plugin: 'engine', tier: 'core' },
      signal: new AbortController().signal,
      core: () => Promise.resolve(undefined),
      report: () => undefined,
      debug: () => undefined,
    },
  );
  expect(seen).toEqual([]);
});
