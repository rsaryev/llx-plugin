/**
 * The settings hook events as mod events. plugins/mods/events.md § Handle the settings hook events;
 * plugins/mods/reference.md § Events > Settings hook events. Which settings hooks run, and the JSON
 * each receives on stdin, are the hook engine's; here the event reaches a mod as `classic.<Event>`.
 */
import { describe, expect, test } from 'bun:test';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import { CLASSIC_EVENT_NAMES } from '../../../src/protocol/mods-events.ts';
import { fakeModInterface } from '../../../src/testing/mods/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness } from '../../support/mods-events.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

const stop = {
  session_id: 's-1',
  transcript_path: '/home/user/.claude/projects/app/s-1.jsonl',
  cwd: '/work/app',
  hook_event_name: 'Stop',
};

describe('the settings hook events', () => {
  spec('mods.reference.Settings hook events', () => {
    test('each settings hook event is an event named classic. and the event name: Stop is classic.Stop, PostToolUse is classic.PostToolUse', () => {
      expect(CLASSIC_EVENT_NAMES).toContain('classic.Stop');
      expect(CLASSIC_EVENT_NAMES).toContain('classic.PostToolUse');
      expect(CLASSIC_EVENT_NAMES.map(String)).toEqual(
        HOOK_EVENTS.map((event) => `classic.${event}`),
      );
    });

    test('e is the hook stdin JSON, field for field, and the hook sees it unchanged through next(e)', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('my-mod', 'user', [
        fn('classic.PostToolUse', (_$, e, next) => (seen.push(e), next(e))),
      ]);
      const stdin = {
        session_id: 's-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_response: { stdout: 'a.ts' },
      };
      expect(await h.fire('classic.PostToolUse', stdin)).toEqual({ core: stdin });
      expect(seen).toEqual([stdin]);
    });
  });
});

describe('handle the settings hook events', () => {
  spec('mods.events.Handle the settings hook events', () => {
    const logger = registerOf((on) => {
      on(
        'classic.Stop',
        async (
          $: { ui: { log(text: string): unknown } },
          e: { transcript_path: string },
          next: (e: unknown) => unknown,
        ) => {
          await $.ui.log('Transcript saved at ' + e.transcript_path);
          return next(e);
        },
      );
    });

    test('the example hook logs where the transcript is saved, from e.transcript_path, and returns next(e) so the Stop hooks of the settings files still run', async () => {
      const lines: string[] = [];
      const reached: unknown[] = [];
      const s = session(
        { 'my-mod': logger },
        { iface: fakeModInterface({ log: (line) => lines.push(line) }) },
      );
      await s.host.load([modPlugin(inline('my-mod'), logger)]);
      const out = await s.host.fire('classic.Stop', stop, {
        core: (e) => (reached.push(e), Promise.resolve({})),
      });
      expect(lines).toEqual([`● my-mod: Transcript saved at ${stop.transcript_path}`]);
      expect(reached).toEqual([stop]);
      expect(out).toEqual({});
    });

    test('a hook that returns without next keeps the settings Stop hooks from running', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('classic.Stop', () => Promise.resolve({}))]);
      await h.fire('classic.Stop', stop);
      expect(h.coreSeen).toEqual([]);
    });

    test('classic.* matches every settings hook event and nothing else, and * matches them too', async () => {
      const h = eventHarness();
      const classic: string[] = [];
      const every: string[] = [];
      h.mod('my-mod', 'user', [
        fn('classic.*', (_$, e, next) => (classic.push(String(e.hook_event_name)), next(e))),
        fn('*', (_$, e, next) => (every.push(String(e.hook_event_name ?? e.tool)), next(e))),
      ]);
      await h.fire('classic.Stop', { hook_event_name: 'Stop' });
      await h.fire('classic.SessionEnd', { hook_event_name: 'SessionEnd' });
      await h.fire('tool.call', { tool: 'Bash' });
      expect(classic).toEqual(['Stop', 'SessionEnd']);
      expect(every).toEqual(['Stop', 'SessionEnd', 'Bash']);
    });

    test('a hook on an event that is no settings hook event is refused when the module loads', async () => {
      const bogus = registerOf((on) => {
        on('classic.Halt', () => ({}));
      });
      const s = session({ 'my-mod': bogus });
      await s.host.load([modPlugin(inline('my-mod'), bogus)]);
      expect(s.debug.join('\n')).toContain('"classic.Halt" is not an event');
    });
  });
});
