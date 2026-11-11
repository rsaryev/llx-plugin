/**
 * plugins/mods/troubleshoot.md § `hook skipped`: "The line names the mod and the event, then says
 * `hook skipped:` and a reason ... A hook threw, exceeded its time limit, or returned a result of
 * the wrong shape. The line appears once for each event and kind of failure until the mod reloads.
 * The debug log has a line for every occurrence."
 */
import { expect, test } from 'bun:test';
import { fakePorts } from '../../../src/testing/mods/index.ts';
import { flush } from '../../support/mods-chain.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { fixedClock } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';

const never = (): Promise<never> => new Promise<never>(() => undefined);
const boom = (): never => {
  throw new Error('boom');
};
let mode = 'throw';

/** The hooks module of the mod: each `on` names its event as a literal, which is what the scan needs. */
const hooks = registerOf((on) => {
  on('tool.call', () => (mode === 'throw' ? boom() : never()));
  on('prompt.submit', () => ({ drop: 5 }));
  on('config.set', () => boom());
});

/** A host on a clock a test moves, with `first-mod` (and `second-mod`, with the same hooks) loaded. */
const hosted = async (...names: string[]) => {
  mode = 'throw';
  const clock = fixedClock();
  const registers = Object.fromEntries(names.map((name) => [name, hooks]));
  const live = session(registers, {
    ports: fakePorts({ clock }).ports,
    firesSessionStart: false,
  });
  await live.host.load(names.map((name) => modPlugin(inline(name), hooks)));
  return { ...live, clock };
};

const call = { tool: 'Bash', input: {} };

spec('mods.troubleshoot.hook skipped', () => {
  test('a hook that threw: the line names the mod and the event, then `hook skipped:` and the reason', async () => {
    const { host, reports } = await hosted('first-mod');
    await host.fire('tool.call', call);
    expect(reports.map((report) => report.line)).toEqual([
      'first-mod: tool.call hook skipped: threw Error: boom',
    ]);
  });

  test('a hook that exceeded its time limit, and one that returned a result of the wrong shape, are skipped the same way', async () => {
    const { host, reports, clock } = await hosted('first-mod');
    mode = 'hang';
    const fired = host.fire('tool.call', call);
    await flush();
    clock.advance(10_000);
    await fired;
    await host.fire('prompt.submit', { text: 'hi' });
    expect(reports.map((report) => report.line)).toEqual([
      'first-mod: tool.call hook skipped: timed out: ran over its 10000 ms limit',
      expect.stringMatching(
        /^first-mod: prompt\.submit hook skipped: returned the wrong shape \(.+\)$/,
      ),
    ]);
  });

  test('the line appears once for each event and kind of failure until the mod reloads; the debug log has a line for every occurrence', async () => {
    const { host, reports, debug } = await hosted('first-mod');
    for (let times = 0; times < 3; times += 1) await host.fire('tool.call', call);
    await host.fire('config.set', { key: 'theme', value: 'dark' });
    await host.fire('config.set', { key: 'theme', value: 'light' });
    expect(reports.map((report) => report.line)).toEqual([
      'first-mod: tool.call hook skipped: threw Error: boom',
      'first-mod: config.set hook skipped: threw Error: boom',
    ]);
    expect(debug.filter((line) => line.includes('hook skipped'))).toHaveLength(5);
    await host.reload();
    await host.fire('tool.call', call);
    expect(reports).toHaveLength(3);
  });

  test('a different kind of failure on the same event is a new line: a throw, then a time-out', async () => {
    const { host, reports, clock } = await hosted('first-mod');
    await host.fire('tool.call', call);
    mode = 'hang';
    const fired = host.fire('tool.call', call);
    await flush();
    clock.advance(10_000);
    await fired;
    const again = host.fire('tool.call', call); // a second time-out is not a new line
    await flush();
    clock.advance(10_000);
    await again;
    // The first hung run is still running 10 s after its budget ended: it lingers (HookBudget.lingerMs).
    expect(reports.map((report) => report.line)).toEqual([
      'first-mod: tool.call hook skipped: threw Error: boom',
      'first-mod: tool.call hook skipped: timed out: ran over its 10000 ms limit',
      'first-mod: tool.call hook lingering: still running 5000 ms after next.signal aborted',
    ]);
  });

  test('another mod failing the same way has its own line', async () => {
    const { host, reports } = await hosted('first-mod', 'second-mod');
    await host.fire('tool.call', call);
    await host.fire('tool.call', call);
    expect(reports.map((report) => report.line)).toEqual([
      'first-mod: tool.call hook skipped: threw Error: boom',
      'second-mod: tool.call hook skipped: threw Error: boom',
    ]);
  });
});
