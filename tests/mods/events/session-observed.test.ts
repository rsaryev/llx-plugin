/**
 * The events of the "Session" table that a hook only observes (plugins/mods/reference.md § Session:
 * `session.start`, `session.end`, `session.attach`, `session.detach`, `session.measure`, each
 * answered with `next(e)`). Through the real loader and host: a hook on the event loads and sees
 * what the host fires, `session.start` reaches each mod once and again after a reload, and a name the
 * reference does not list is refused. The answers of the other session events are in session.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  EVENT_SPECS,
  SESSION_END_REASONS,
  eventInputProblem,
} from '../../../src/mods/events/index.ts';
import { MOD_EVENT_GROUPS } from '../../../src/protocol/mods-events.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

/**
 * The loader reads a module's `on('<event>', ...)` calls from its text, so each event is a literal
 * here. A hook on the event loads and sees what the host fires; a name the reference does not list
 * is refused with the loader's line.
 */
type Next = (e: unknown) => unknown;
const seen: unknown[] = [];

const REGISTERS = {
  'session.start': registerOf((on) => {
    on('session.start', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
  }),
  'session.attach': registerOf((on) => {
    on('session.attach', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
  }),
  'session.detach': registerOf((on) => {
    on('session.detach', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
  }),
  'session.measure': registerOf((on) => {
    on('session.measure', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
  }),
  'session.end': registerOf((on) => {
    on('session.end', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
  }),
} as const;
const NO_EVENT = registerOf((on) => {
  on('session.bogus', (_$: unknown, e: unknown, next: Next) => (seen.push(e), next(e)));
});

async function hostedHook(event: keyof typeof REGISTERS, input: Record<string, unknown>) {
  seen.length = 0;
  const hook = REGISTERS[event];
  const { host, debug } = session({ 'watcher-mod': hook });
  await host.load([modPlugin(inline('watcher-mod'), hook)]);
  const before = [...seen];
  return { debug, seen: [...before], fired: await host.fire(event, input), after: [...seen] };
}

/** What every event of the "Session" table shares: it is an event, and a hook on it loads and sees it. */
function observesEvent(event: keyof typeof REGISTERS, input: Record<string, unknown>) {
  test(`${event} is an event of the session table, a hook on it loads, and a name the reference does not list is refused`, async () => {
    expect(MOD_EVENT_GROUPS.session.map(String)).toContain(event);
    expect(Object.hasOwn(EVENT_SPECS, event)).toBe(true);
    expect((await hostedHook(event, input)).debug).toEqual(
      ['watcher-mod@inline loaded (tier user); events: ' + event].map(
        (line) => `hooks module ${line}`,
      ),
    );
    const { host, debug } = session({ 'watcher-mod': NO_EVENT });
    await host.load([modPlugin(inline('watcher-mod'), NO_EVENT)]);
    expect(debug.join('\n')).toContain('"session.bogus" is not an event');
  });

  test(`a hook on ${event} sees what the host fires`, async () => {
    const run = await hostedHook(event, input);
    expect(run.after.slice(run.seen.length)).toEqual([input]);
  });
}

describe('the events a hook only observes', () => {
  spec('mods.event.session.start', () => {
    observesEvent('session.start', { surface: 'terminal' });

    test('the host fires it once for each loaded mod, to that mod alone, with the surface, interactivity and directory', async () => {
      const heard: Record<string, unknown[]> = { 'first-mod': [], 'second-mod': [] };
      const watch = (name: string) =>
        registerOf((on) => {
          on('session.start', (_$: unknown, e: unknown) => (heard[name]?.push(e), e));
        });
      const first = watch('first-mod');
      const second = watch('second-mod');
      const { host } = session({ 'first-mod': first, 'second-mod': second });
      await host.load([
        modPlugin(inline('first-mod'), first),
        modPlugin(inline('second-mod'), second),
      ]);
      const start = { surface: 'terminal', isInteractive: true, cwd: '/work' };
      expect(heard).toEqual({ 'first-mod': [start], 'second-mod': [start] });
    });

    test('and again after a reload of that mod, but not for any other reason', async () => {
      const starts: string[] = [];
      const watch = registerOf((on) => {
        on('session.start', () => (starts.push('start'), {}));
      });
      const { host } = session({ 'first-mod': watch });
      await host.load([modPlugin(inline('first-mod'), watch)]);
      expect(starts).toHaveLength(1);
      await host.fire('session.end', { reason: 'clear' });
      await host.fire('session.end', { reason: 'resume' });
      expect(starts).toHaveLength(1);
      await host.reload();
      expect(starts).toHaveLength(2);
    });
  });

  spec('mods.event.session.attach', () => {
    observesEvent('session.attach', { app: 'desktop' });

    test('attach is not detach: a hook on one never sees the other', async () => {
      const heard: string[] = [];
      const hook = registerOf((on) => {
        on('session.attach', (_$: unknown, e: unknown) => (heard.push('attach'), e));
      });
      const { host } = session({ 'watcher-mod': hook });
      await host.load([modPlugin(inline('watcher-mod'), hook)]);
      await host.fire('session.detach', {});
      expect(heard).toEqual([]);
      await host.fire('session.attach', {});
      expect(heard).toEqual(['attach']);
    });
  });

  spec('mods.event.session.detach', () => {
    observesEvent('session.detach', { app: 'desktop' });

    test('detach is not attach: a hook on one never sees the other', async () => {
      const heard: string[] = [];
      const hook = registerOf((on) => {
        on('session.detach', (_$: unknown, e: unknown) => (heard.push('detach'), e));
      });
      const { host } = session({ 'watcher-mod': hook });
      await host.load([modPlugin(inline('watcher-mod'), hook)]);
      await host.fire('session.attach', {});
      expect(heard).toEqual([]);
      await host.fire('session.detach', {});
      expect(heard).toEqual(['detach']);
    });
  });

  spec('mods.event.session.measure', () => {
    observesEvent('session.measure', { percentUsed: 12 });
  });
});

describe('session.end', () => {
  spec('mods.event.session.end', () => {
    test('e.reason is clear, resume, logout, prompt_input_exit or other, and nothing else', () => {
      expect([...SESSION_END_REASONS]).toEqual([
        'clear',
        'resume',
        'logout',
        'prompt_input_exit',
        'other',
      ]);
      for (const reason of SESSION_END_REASONS) {
        expect(eventInputProblem('session.end', { reason })).toBeUndefined();
      }
      for (const wrong of ['branch', 'exit', 'Clear', '', 1, undefined]) {
        expect(eventInputProblem('session.end', { reason: wrong })).toContain(
          'session.end input: reason',
        );
      }
      expect(eventInputProblem('session.end', {})).toContain('reason');
    });

    test('a hook on it through the host sees the reason it was fired with', async () => {
      const run = await hostedHook('session.end', { reason: 'resume' });
      expect(run.after.slice(run.seen.length)).toEqual([{ reason: 'resume' }]);
    });
  });
});
