/**
 * What a mods host keeps after `dispose()`. claude-code/index.d.ts:4606 (`session.start`): it
 * "Fires once per process for each loaded plugin, before the first prompt, then once per fresh load
 * of one (never `/clear`)", and :10174 (`Register`): "The options are fixed for this activation".
 * Claude Code runs one session per process, so a host that serves several sessions from one process
 * runs a mods host per session and disposes it when the session ends; this checks that nothing a
 * mod made outlives that, even while the host object itself is still referenced: the loaded mods,
 * their plugins and files, module state, hooks and `next`.
 */
import { describe, expect, test } from 'bun:test';
import type { ModsHost } from '../../../src/mods/index.ts';
import { flush } from '../../support/mods-chain.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';

const MODS = 8;

/** A mod whose module state, hook closure and the `next` it was given are watched through weak references. */
function watchedMod(watched: WeakRef<object>[]) {
  return registerOf((on) => {
    const state = { rows: Array.from({ length: 1000 }, (_, index) => ({ index })) };
    watched.push(new WeakRef(state));
    on('tool.call', function hook(_$: unknown, e: unknown, next: (e: unknown) => unknown) {
      watched.push(new WeakRef(next), new WeakRef(hook));
      state.rows.push({ index: -1 });
      return next(e);
    });
  });
}

async function loadedHost(watched: WeakRef<object>[]): Promise<ModsHost> {
  const registers = Object.fromEntries(
    Array.from({ length: MODS }, (_, index) => [`mod-${index}`, watchedMod(watched)]),
  );
  const { host } = session(registers, { firesSessionStart: false });
  const plugins = Object.entries(registers).map(([name, register]) =>
    modPlugin(inline(name), register),
  );
  const report = await host.load(plugins);
  for (const plugin of plugins) watched.push(new WeakRef(plugin), new WeakRef(plugin.files));
  for (const mod of report.loaded) watched.push(new WeakRef(mod));
  await host.fire('tool.call', { tool: 'Read', input: {} });
  return host;
}

const gone = (watched: readonly WeakRef<object>[]): number =>
  watched.filter((ref) => ref.deref() === undefined).length;

/**
 * How many of `watched` are collected, after collections until `want` are or 40 rounds pass. Each
 * round waits a timer turn, so no frame of the last call is on the stack JSC scans conservatively.
 */
const collected = async (watched: readonly WeakRef<object>[], want: number): Promise<number> => {
  for (let round = 0; round < 40 && gone(watched) < want; round += 1) {
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    Bun.gc(true);
  }
  return gone(watched);
};

describe('a disposed mods host releases what its mods made', () => {
  test("every mod's module state, hook and next are collected while the host is still held", async () => {
    const watched: WeakRef<object>[] = [];
    const host = await loadedHost(watched);
    expect(watched).toHaveLength(MODS * 6);
    await host.dispose();
    expect(await collected(watched, watched.length)).toBe(watched.length);
    expect(host.active()).toEqual([]);
  });

  test("a host not disposed keeps the state and hooks, only each dispatch's next goes", async () => {
    const watched: WeakRef<object>[] = [];
    const host = await loadedHost(watched);
    expect(await collected(watched, MODS)).toBe(MODS);
    await host.dispose();
  });
});
