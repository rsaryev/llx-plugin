/**
 * plugins/mods/troubleshoot.md § `it crashed the hooks worker` ("Installed mods share one worker
 * thread. The worker stopped responding or crashed, and Claude Code traced that to this mod and
 * unloaded it"), § `mods that run in the hooks worker are off for this session` ("The worker stopped
 * three times and Claude Code couldn't trace the stops to one mod, so it unloaded every mod that
 * isn't built in, including mods your organization installs ... Run `/reload-plugins` to load them
 * again") and § `A value resets when the module reloads` ("Module-level variables are
 * re-initialized on each reload. Keep the value in `$.state` or `$.store`").
 */
import { expect, test } from 'bun:test';
import type { JsonObject } from '../../../src/foundation/index.ts';
import { read } from '../../../src/mods/api/index.ts';
import type { ModPlugin } from '../../../src/mods/load/index.ts';
import type { ModsApi } from '../../../src/mods/types.ts';
import { fakePorts, type RegisterFunction } from '../../../src/testing/mods/index.ts';
import { crashSession } from '../../support/mods-crash.ts';
import { inline, modPlugin, organizations, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const OFF = 'hooks: mods that run in the hooks worker are off for this session: it crashed 3 times';

/** A mod that notes each `session.start` and each `tool.call` it answers. */
function noting(name: string, seen: string[]): RegisterFunction {
  return registerOf((on) => {
    on('session.start', (_$: unknown, e: unknown) => {
      seen.push(`${name}:start`);
      return e;
    });
    on('tool.call', (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => {
      seen.push(`${name}:call`);
      return next(e);
    });
  });
}

const plugins = (seen: string[], names: readonly string[]): ModPlugin[] =>
  names.map((name) => modPlugin(inline(name), noting(name, seen)));

const registersOf = (seen: string[], names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, noting(name, seen)]));

const untraced = { reason: 'the worker stopped responding' };

spec('mods.troubleshoot.it crashed the hooks worker', () => {
  test('the mod the crash is traced to is unloaded, and the line is "<mod> was unloaded: it crashed the hooks worker"', async () => {
    const seen: string[] = [];
    const s = crashSession(registersOf(seen, ['first-mod', 'second-mod']));
    await s.host.load(plugins(seen, ['first-mod', 'second-mod']));
    await s.worker.crash({ reason: 'the loop never awaited', culprit: 'first-mod' });
    expect(s.notices.map((notice) => notice.line)).toEqual([
      'first-mod was unloaded: it crashed the hooks worker',
    ]);
    expect(s.host.active().map((mod) => mod.name)).toEqual(['second-mod']);
  });

  test('its hooks stop answering; the other mods run on', async () => {
    const seen: string[] = [];
    const s = crashSession(registersOf(seen, ['first-mod', 'second-mod']));
    await s.host.load(plugins(seen, ['first-mod', 'second-mod']));
    await s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    seen.length = 0;
    await s.host.fire('tool.call', { tool: 'Bash' });
    expect(seen).toEqual(['second-mod:call']);
  });

  test('the line reaches the transcript of an interactive session, and the debug log has it', async () => {
    const seen: string[] = [];
    const s = crashSession(registersOf(seen, ['first-mod']));
    await s.host.load(plugins(seen, ['first-mod']));
    await s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    expect(s.notices.map((notice) => notice.channel)).toEqual(['transcript']);
    expect(s.debug).toContain('first-mod was unloaded: it crashed the hooks worker');
  });

  test('a mod that was not traced keeps running in a fresh copy of the module', async () => {
    const seen: string[] = [];
    const s = crashSession(registersOf(seen, ['first-mod', 'second-mod']));
    await s.host.load(plugins(seen, ['first-mod', 'second-mod']));
    await s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    expect(s.worker.loads.get('second-mod')).toBe(2);
    expect(seen.filter((entry) => entry === 'second-mod:start')).toHaveLength(2);
  });
});

spec('mods.troubleshoot.mods that run in the hooks worker are off for this session', () => {
  test("the third stop that cannot be traced to one mod unloads every mod that is not built in, with the page's line", async () => {
    const seen: string[] = [];
    const names = ['first-mod', 'second-mod'];
    const s = crashSession(registersOf(seen, names));
    await s.host.load(plugins(seen, names));
    await s.worker.crash(untraced);
    await s.worker.crash(untraced);
    expect(s.notices).toEqual([]);
    expect(s.host.active().map((mod) => mod.name)).toEqual(names);
    await s.worker.crash(untraced);
    expect(s.notices.map((notice) => notice.line)).toEqual([OFF]);
    expect(s.host.active()).toEqual([]);
  });

  test('the line reaches the transcript of an interactive session', async () => {
    const seen: string[] = [];
    const s = crashSession(registersOf(seen, ['first-mod']));
    await s.host.load(plugins(seen, ['first-mod']));
    for (let stop = 0; stop < 3; stop += 1) await s.worker.crash(untraced);
    expect(s.notices.map((notice) => notice.channel)).toEqual(['transcript']);
  });

  test('a mod the organization installs is unloaded too, and a mod built into Claude Code stays and answers', async () => {
    const seen: string[] = [];
    const s = crashSession({
      ...registersOf(seen, ['first-mod']),
      'org-mod': noting('org-mod', seen),
    });
    await s.host.registerBuiltIn('native', 'builtin', [
      { event: 'tool.call', isGenerator: false, run: () => ({ result: 'native' }) },
    ]);
    await s.host.load([
      modPlugin(inline('first-mod'), noting('first-mod', seen)),
      modPlugin(organizations('org-mod'), noting('org-mod', seen)),
    ]);
    for (let stop = 0; stop < 3; stop += 1) await s.worker.crash(untraced);
    expect(s.host.active().map((mod) => mod.name)).toEqual(['native']);
    expect(await s.host.fire('tool.call', { tool: 'Bash' })).toEqual({ result: 'native' });
  });

  test('/reload-plugins loads them again, and the count of stops starts over', async () => {
    const seen: string[] = [];
    const names = ['first-mod', 'second-mod'];
    const s = crashSession(registersOf(seen, names));
    await s.host.load(plugins(seen, names));
    for (let stop = 0; stop < 3; stop += 1) await s.worker.crash(untraced);
    const report = await s.host.reload();
    expect(report.loaded.map((mod) => mod.name)).toEqual(names);
    s.notices.length = 0;
    await s.worker.crash(untraced);
    await s.worker.crash(untraced);
    expect(s.notices).toEqual([]);
    expect(s.host.active().map((mod) => mod.name)).toEqual(names);
  });

  test('stops traced to one mod do not count toward the three', async () => {
    const seen: string[] = [];
    const names = ['first-mod', 'second-mod'];
    const s = crashSession(registersOf(seen, names));
    await s.host.load(plugins(seen, names));
    await s.worker.crash(untraced);
    await s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    await s.worker.crash(untraced);
    expect(s.notices.map((notice) => notice.line)).toEqual([
      'first-mod was unloaded: it crashed the hooks worker',
    ]);
    expect(s.host.active().map((mod) => mod.name)).toEqual(['second-mod']);
  });
});

spec('mods.troubleshoot.A value resets when the module reloads', () => {
  /** A module whose top level declares `count`: evaluating the module again starts it at 0. */
  const counting = (readings: number[]) => (): RegisterFunction => {
    let count = 0;
    return registerOf((on) => {
      on('tool.call', async ($: ModsApi, e: unknown, next: (e: unknown) => Promise<unknown>) => {
        count += 1;
        const saved = Number((await read($, { plugin: 'first-mod', key: 'n' })) ?? 0) + 1;
        await $.state.set({ plugin: 'first-mod', key: 'n' }, saved);
        readings.push(count * 100 + saved);
        return next(e);
      });
    });
  };

  test('a module-level variable starts again after /reload-plugins, and a value kept in $.state survives it', async () => {
    const readings: number[] = [];
    const make = counting(readings);
    let current = make();
    const { host } = session({ 'first-mod': (on, options) => current(on, options) });
    await host.load([modPlugin(inline('first-mod'), (on) => void on)]);
    await host.fire('tool.call', { tool: 'Bash' });
    await host.fire('tool.call', { tool: 'Bash' });
    current = make();
    await host.reload();
    await host.fire('tool.call', { tool: 'Bash' });
    // [count, state]: the count restarts at 1 after the reload, the state goes on at 3.
    expect(readings).toEqual([101, 202, 103]);
  });

  test('a value kept in $.store survives it too', async () => {
    const written: JsonObject = {};
    const store = {
      read: () => Promise.resolve({ ...written }),
      write: (_plugin: string, data: JsonObject) => {
        Object.assign(written, data);
        return Promise.resolve();
      },
    };
    let seen: unknown;
    let loads = 0;
    const { host } = session(
      {
        'first-mod': registerOf((on) => {
          loads += 1;
          on('session.start', async ($: ModsApi, e: unknown) => {
            seen = await $.store.get('n');
            await $.store.set('n', loads);
            return e;
          });
        }),
      },
      { ports: fakePorts({ store }).ports },
    );
    await host.load([modPlugin(inline('first-mod'), (on) => void on)]);
    expect(seen).toBeUndefined();
    await host.reload();
    expect(seen).toBe(1);
    expect(loads).toBe(2);
  });
});
