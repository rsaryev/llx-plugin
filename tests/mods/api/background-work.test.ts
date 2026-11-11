/**
 * plugins/mods/api.md § Start a turn from a background job (`$.prompt.submit({ text })`: "Claude reads
 * the text after a sentence that names your mod as the sender. To send it as the user's own words ...
 * add `asUser: true`. The call waits until the session is idle and then starts a new turn. It
 * resolves when that turn starts"), § Stop background work ("Timers stop after the module reloads ...
 * `next.signal` is an `AbortSignal` that aborts when the event your hook is handling is abandoned, for
 * example when the user interrupts"), § Retry a refused or dropped call (the `submitPrompt` example
 * and the two strings it keeps a prompt for).
 */
import { expect, test } from 'bun:test';
import type { ModsApi } from '../../../src/mods/types.ts';
import { createMockClock, fakePorts } from '../../../src/testing/mods/index.ts';
import { flush } from '../../support/mods-chain.ts';
import { prompting } from '../../support/mods-prompting.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

spec('mods.apiGuide.Start a turn from a background job', () => {
  /** A mod whose timer, started in `session.start`, submits a prompt a second later. */
  function timed(asUser: boolean, outcome: unknown[]) {
    return registerOf((on) => {
      on('session.start', ($: ModsApi, e: unknown) => {
        $.clock.after(1000, async () => {
          const answer = await $.prompt.submit(
            asUser ? { text: 'checks failed', asUser: true } : { text: 'checks failed' },
          );
          outcome.push(answer);
        });
        return e;
      });
    });
  }

  async function start(asUser: boolean) {
    const clock = createMockClock();
    const host = prompting();
    const outcome: unknown[] = [];
    const mod = timed(asUser, outcome);
    const s = session({ 'first-mod': mod }, { ports: fakePorts({ ...host.ports, clock }).ports });
    await s.host.load([modPlugin(inline('first-mod'), mod)]);
    return { clock, host, outcome };
  }

  test('a background job submits a prompt: the text names the mod as the sender, outside any event', async () => {
    const { clock, host } = await start(false);
    expect(host.submitted).toEqual([]);
    await clock.advance(1000);
    expect(host.submitted).toEqual([{ text: 'checks failed', from: 'first-mod' }]);
  });

  test("asUser: true sends it as the user's own words, without the sender", async () => {
    const { clock, host } = await start(true);
    await clock.advance(1000);
    expect(host.submitted).toEqual([{ text: 'checks failed', asUser: true }]);
  });

  test('the call waits until the session is idle and resolves when the turn starts', async () => {
    const { clock, host, outcome } = await start(false);
    host.state.holding = true;
    await clock.advance(1000);
    await flush();
    expect(host.submitted).toHaveLength(1);
    expect(outcome).toEqual([]);
    host.release[0]?.();
    await flush();
    expect(outcome).toEqual([{ text: 'checks failed' }]);
  });
});

spec('mods.apiGuide.Stop background work', () => {
  /** A mod whose `session.start` starts a timer that notes which copy of the module started it. */
  function ticking(ticks: string[]) {
    let copies = 0;
    return registerOf((on) => {
      copies += 1;
      const copy = `copy ${copies}`;
      on('session.start', ($: ModsApi, e: unknown) => {
        $.clock.every(60_000, () => {
          ticks.push(copy);
        });
        return e;
      });
    });
  }

  async function started() {
    const clock = createMockClock();
    const ticks: string[] = [];
    const mod = ticking(ticks);
    const s = session({ 'first-mod': mod }, { ports: fakePorts({ clock }).ports });
    await s.host.load([modPlugin(inline('first-mod'), mod)]);
    return { clock, ticks, host: s.host, mod };
  }

  test('a timer runs while its module is loaded', async () => {
    const { clock, ticks } = await started();
    await clock.advance(60_000);
    await clock.advance(60_000);
    expect(ticks).toEqual(['copy 1', 'copy 1']);
  });

  test("timers stop after the module reloads: only the fresh copy's timer runs", async () => {
    const { clock, ticks, host } = await started();
    await clock.advance(60_000);
    await host.reload();
    await clock.advance(60_000);
    expect(ticks).toEqual(['copy 1', 'copy 2']);
  });

  test('timers stop when the mod is unloaded', async () => {
    const { clock, ticks, host } = await started();
    await host.unloadMod('first-mod');
    await clock.advance(180_000);
    expect(ticks).toEqual([]);
  });

  test('next.signal aborts when the event the hook is handling is abandoned, for example when the user interrupts', async () => {
    const seen: boolean[] = [];
    const mod = registerOf((on) => {
      on('tool.call', async (_$: ModsApi, e: unknown, next: { signal: AbortSignal }) => {
        await new Promise<void>((resolve) =>
          next.signal.addEventListener('abort', () => resolve()),
        );
        seen.push(next.signal.aborted);
        return e;
      });
    });
    const s = session({ 'first-mod': mod });
    await s.host.load([modPlugin(inline('first-mod'), mod)]);
    const interruption = new AbortController();
    const running = s.host.fire('tool.call', { tool: 'Bash' }, { signal: interruption.signal });
    await flush();
    expect(seen).toEqual([]);
    interruption.abort(new Error('the user interrupted'));
    await running;
    expect(seen).toEqual([true]);
  });
});
