/**
 * plugins/mods/reference.md § Mods API calls: "Every mods API method is also an event, named for its
 * namespace and method, such as `fs.read`, `model.complete`, or `ui.open`. A hook on one intercepts
 * calls from the mods that run after it, and can return `next(e)`, `{ deny: reason }`, or
 * `{ value }`." Its examples are the calls below; the other calls are held to the same rule by the
 * names the reference lists (§ Mods API methods) through `describeApi`.
 */
import { expect, test } from 'bun:test';
import { describeApi } from '../../../src/mods/api/index.ts';
import { validateMod } from '../../../src/mods/load/commands/validate.ts';
import { API_EVENT_NAMES, type ApiEventName } from '../../../src/protocol/mods-events.ts';
import { withUiRules } from '../../../src/mods/ui/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, modelUsage } from '../../support/mods-api.ts';
import {
  drive,
  isOwnResult,
  hookAnswer,
  REASON,
  SENTINEL,
  type Driven,
} from '../../support/mods-api-drive.ts';
import { CALL_SAMPLES, NOT_FIRED_BY_A_CALL } from '../../support/mods-api-samples.ts';
import { fakeInterface, uiOver } from '../../support/mods-ui.ts';
import { memoryFiles } from '../../support/ports.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const usage = modelUsage;
const models = () => {
  const calls: unknown[] = [];
  return {
    calls,
    complete(call: unknown) {
      calls.push(call);
      return Promise.resolve({ isAnswered: true as const, text: 'from the model', usage });
    },
    fork: () => Promise.reject(new Error('unused')),
    classify: () => Promise.reject(new Error('unused')),
  };
};

const isApiEventName = (name: string): name is ApiEventName => Object.hasOwn(CALL_SAMPLES, name);

/** Whether a call that a hook answered with `{ value }` resolved to what the page says it does. */
function answeredAs(event: ApiEventName, run: Driven): boolean {
  if (event === 'clock.after' || event === 'clock.every') return 'resolved' in run.outcome;
  // api.md, "Send a notification": a hook that answers `ui.notify` in Claude Code's place sent nothing, which the call says as `refused`.
  if (event === 'ui.notify') {
    return (
      'resolved' in run.outcome &&
      Bun.deepEquals(run.outcome.resolved, { isSent: false, reason: 'refused' })
    );
  }
  const answer = isOwnResult(event) ? hookAnswer(event, 'value') : SENTINEL;
  return 'resolved' in run.outcome && Bun.deepEquals(run.outcome.resolved, answer);
}

/** Whether a call that a hook refused rejected with the reason, or resolved to `{ deny }` where the result is the event's own. */
function refusedAs(event: ApiEventName, run: Driven): boolean {
  if (event === 'clock.after' || event === 'clock.every') {
    return run.debug.some((line) => line.includes(REASON));
  }
  // A stream's `{ deny }` is the one answer of it that is special: it rejects (test.md, "Follow the test kit's rules").
  if (isOwnResult(event) && event !== 'process.spawn') {
    return (
      'resolved' in run.outcome && Bun.deepEquals(run.outcome.resolved, hookAnswer(event, 'deny'))
    );
  }
  return 'rejected' in run.outcome && run.outcome.rejected.includes(REASON);
}

spec('mods.reference.Mods API calls', () => {
  test('fs.read, model.complete and ui.open are events: a hook on each sees the call and next(e) reaches Claude Code', async () => {
    const { iface } = fakeInterface();
    const port = models();
    const read: string[] = [];
    const h = await apiHarness({
      rules: withUiRules,
      ui: uiOver(iface),
      ports: {
        models: port,
        fs: {
          read: (path: string) => (
            read.push(path),
            Promise.resolve({ text: 'contents', bytes: 8 })
          ),
          write: () => Promise.reject(new Error('unused')),
          list: () => Promise.reject(new Error('unused')),
          stat: () => Promise.reject(new Error('unused')),
          exists: () => Promise.reject(new Error('unused')),
          ancestors: () => Promise.reject(new Error('unused')),
        },
      },
    });
    const seen: string[] = [];
    const watch = (event: string) =>
      fn(event, (_$, e, next) => (seen.push(event + ':' + JSON.stringify(e)), next(e)));
    await h.mod('watcher', 'prepend', [
      watch('fs.read'),
      watch('model.complete'),
      watch('ui.open'),
    ]);
    expect(await h.api.fs.read('/work/notes.md')).toBe('contents');
    await h.api.model.complete({ model: 'haiku', prompt: 'hi' });
    await h.api.ui.open({ id: 'my-pane' });
    expect(seen).toHaveLength(3);
    expect(seen[0]).toStartWith('fs.read:');
    expect(seen[0]).toContain('/work/notes.md');
    expect(seen[1]).toStartWith('model.complete:');
    expect(seen[2]).toStartWith('ui.open:');
    expect(read).toEqual(['/work/notes.md']);
    expect(port.calls).toHaveLength(1);
  });

  test('{ value } answers the call in Claude Code place: the port is never reached', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.mod('stub', 'prepend', [
      fn('model.complete', () => ({ value: { isAnswered: true, text: 'stubbed', usage } })),
    ]);
    expect(await h.api.model.complete({ model: 'haiku', prompt: 'hi' })).toEqual({
      isAnswered: true,
      text: 'stubbed',
      usage,
    });
    expect(port.calls).toHaveLength(0);
  });

  test('{ deny: reason } refuses the call: it rejects with the reason and the port is never reached', async () => {
    const port = models();
    const h = await apiHarness({ ports: { models: port } });
    await h.mod('policy', 'prepend', [fn('model.complete', () => ({ deny: 'no models today' }))]);
    expect(await rejection(h.api.model.complete({ model: 'haiku', prompt: 'hi' }))).toContain(
      'no models today',
    );
    expect(port.calls).toHaveLength(0);
  });

  test('a hook intercepts only the calls of the mods that run after it: the owner and the mods before it get the answer of Claude Code', async () => {
    const intercepted = await apiHarness({ plugin: 'late', tier: 'append' });
    await intercepted.mod('early-hook', 'prepend', [fn('clock.now', () => ({ value: 42 }))]);
    // The hook is of a mod before the caller: the call is intercepted.
    expect(await intercepted.api.clock.now()).toBe(42);

    const owner = await apiHarness();
    const own = await owner.mod('early-hook', 'prepend', [fn('clock.now', () => ({ value: 42 }))]);
    // The mod that owns the hook is not intercepted by it when it is the one calling: the clock port answers.
    expect(await own.api.clock.now()).toBe(0);
  });

  test('a hook of a mod that runs after the caller never sees its call: not for a user or prepend caller, whatever the hook answers', async () => {
    for (const [caller, hook] of [
      ['user', 'append'],
      ['prepend', 'user'],
      ['prepend', 'append'],
      ['user', 'builtin'],
    ] as const) {
      for (const answer of [{ value: 42 }, { deny: 'not now' }]) {
        const h = await apiHarness({ plugin: 'caller', tier: caller });
        const seen: string[] = [];
        await h.mod('later-hook', hook, [fn('clock.now', () => (seen.push('clock.now'), answer))]);
        // The clock port answers: nothing was changed or refused, and the hook never ran.
        expect(await h.api.clock.now()).toBe(0);
        expect(seen).toEqual([]);
      }
    }
  });

  test('every call of the table has sample arguments, so no call escapes the test below', () => {
    const missing = API_EVENT_NAMES.filter((name) => !Object.hasOwn(CALL_SAMPLES, name));
    expect(missing).toEqual([]);
    expect(Object.keys(CALL_SAMPLES).toSorted()).toEqual([...API_EVENT_NAMES].toSorted());
    // A call set aside is one the page's own rule says does not fire at the call, and it names where it is proven.
    for (const name of Object.keys(NOT_FIRED_BY_A_CALL)) expect(API_EVENT_NAMES).toContain(name);
  });

  test('every call of the table is such an event: next(e) reaches Claude Code as it would with no hook, { value } answers in its place, { deny } refuses it', async () => {
    for (const event of API_EVENT_NAMES.filter((name) => !(name in NOT_FIRED_BY_A_CALL))) {
      if (!isApiEventName(event)) throw new Error(`${event} has no sample arguments`);
      const bare = await drive(event, 'none');
      const passed = await drive(event, 'next');
      const answered = await drive(event, 'value');
      const refused = await drive(event, 'deny');
      const at = `at ${event}`;
      // The hook saw the call it was given, and next(e) changed nothing about what Claude Code does with it.
      expect([at, passed.seen.length]).toEqual([at, 1]);
      expect([at, passed.outcome]).toEqual([at, bare.outcome]);
      expect([at, passed.reached]).toEqual([at, bare.reached]);
      expect([at, passed.timers]).toEqual([at, bare.timers]);
      // An answer of the hook is the call's result and Claude Code is never asked.
      expect([at, answered.seen.length, refused.seen.length]).toEqual([at, 1, 1]);
      expect([at, answered.reached]).toEqual([at, []]);
      expect([at, refused.reached]).toEqual([at, []]);
      expect([at, answered.timers, refused.timers]).toEqual([at, 0, 0]);
      expect([at, answeredAs(event, answered)]).toEqual([at, true]);
      expect([at, refusedAs(event, refused)]).toEqual([at, true]);
    }
  });

  test('a hook module can name every call of the table as an event, and no other name is one', async () => {
    const h = await apiHarness();
    const events = describeApi(h.api).flatMap((entry) =>
      entry.members.flatMap((m) => m.event ?? []),
    );
    expect(events.map(String).toSorted()).toEqual([...API_EVENT_NAMES].toSorted());
    const module = (names: readonly string[]) =>
      `export function register(on) {\n${names.map((name) => `  on('${name}', async ($, e, next) => next(e))`).join('\n')}\n}`;
    const folder = (source: string) =>
      memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({ name: 'm', version: '0.1.0' }),
        'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
        'hooks/register.js': source,
      });
    const known = await validateMod({ files: folder(module(events)), target: '.' });
    expect(known.lines.join('\n')).not.toContain('is not an event');
    const unknown = await validateMod({ files: folder(module(['fs.slurp'])), target: '.' });
    expect(unknown.lines.join('\n')).toContain('"fs.slurp" is not an event');
  });
});
