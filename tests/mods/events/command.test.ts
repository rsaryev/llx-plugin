/**
 * The command and `/config` events. plugins/mods/reference.md § Commands and configuration;
 * plugins/mods/api.md § Add a command; plugins/mods/events.md § Handle a hook that fails (a
 * `config.set` guard). Which row the user changes and when a command list is built is the host's.
 */
import { describe, expect, test } from 'bun:test';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { inline, modPlugin, registerOf, session } from '../../support/mods-load.ts';
import { spec } from '../../support/spec.ts';

type Registered = { command: { register(command: unknown): Promise<unknown> } };
type Next = (e: unknown) => unknown;

async function answered(event: string, input: Record<string, unknown>, answer: unknown) {
  const h = eventHarness();
  h.mod('my-mod', 'user', [fn(event, () => Promise.resolve(answer))]);
  return { result: await h.fire(event, input), skipped: reasonsOf(h).length === 1 };
}

describe('command.run', () => {
  const run = { command: 'tally', args: '3' };
  spec('mods.event.command.run', () => {
    test('{ text } is what the command prints, and the hook gets the command and its arguments', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn(
          'command.run',
          (_$, e) => Promise.resolve({ text: `${String(e.command)} ${String(e.args)}` }),
          {
            matcher: { command: 'tally' },
          },
        ),
      ]);
      expect(await h.fire('command.run', run)).toEqual({ text: 'tally 3' });
      expect(await h.fire('command.run', { command: 'other', args: '' })).toEqual({
        core: { command: 'other', args: '' },
      });
    });

    test('{} prints nothing and next(e) leaves the command to Claude Code', async () => {
      expect(await answered('command.run', run, {})).toEqual({ result: {}, skipped: false });
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('command.run', (_$, e, next) => next(e))]);
      expect(await h.fire('command.run', run)).toEqual({ core: run });
    });

    test('a text that is not a string fails the hook: the hook is skipped and the command goes on', async () => {
      expect(await answered('command.run', run, { text: 5 })).toEqual({
        result: { core: run },
        skipped: true,
      });
    });
  });
});

describe('command.describe', () => {
  spec('mods.event.command.describe', () => {
    test('{ description, argumentHint, isHidden } describes the command in the list', async () => {
      const description = { description: 'Count things', argumentHint: '<n>', isHidden: false };
      expect(await answered('command.describe', {}, description)).toEqual({
        result: description,
        skipped: false,
      });
    });

    test('a description or hint that is not a string, or isHidden that is not a flag, fails the hook', async () => {
      for (const wrong of [{ description: 1 }, { argumentHint: [] }, { isHidden: 'yes' }]) {
        expect((await answered('command.describe', {}, wrong)).skipped).toBe(true);
      }
    });
  });
});

describe('config.set', () => {
  spec('mods.event.config.set', () => {
    test('next({ ...e, value }) changes the value the row is set to', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('config.set', (_$, e, next) => next({ ...e, value: 'safe' }))]);
      await h.fire('config.set', { value: 'unsafe' });
      expect(h.coreSeen).toEqual([{ value: 'safe' }]);
    });

    test('{ deny: reason } refuses the change without calling next', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('config.set', () => Promise.resolve({ deny: 'Locked by policy.' })),
      ]);
      expect(await h.fire('config.set', { value: 1 })).toEqual({ deny: 'Locked by policy.' });
      expect(h.coreSeen).toEqual([]);
    });

    test('a guard that fails with next.called false answers { deny } from its .catch', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('config.set', () => Promise.reject(new Error('boom')), {
          handler: (_$, e, next) =>
            next.called ? next(e) : Promise.resolve({ deny: 'the guard failed' }),
        }),
      ]);
      expect(await h.fire('config.set', { value: 1 })).toEqual({ deny: 'the guard failed' });
    });

    test('a deny that is not a string fails the hook and the change goes on', async () => {
      expect(await answered('config.set', { value: 1 }, { deny: true })).toEqual({
        result: { core: { value: 1 } },
        skipped: true,
      });
    });
  });
});

describe('config.describe', () => {
  spec('mods.event.config.describe', () => {
    test('{ label, description, isHidden } describes the /config row', async () => {
      const row = { label: 'Theme', description: 'Colours', isHidden: true };
      expect(await answered('config.describe', {}, row)).toEqual({ result: row, skipped: false });
    });

    test('a label that is not a string, or isHidden that is not a flag, fails the hook', async () => {
      expect((await answered('config.describe', {}, { label: 3 })).skipped).toBe(true);
      expect((await answered('config.describe', {}, { isHidden: 0 })).skipped).toBe(true);
    });
  });
});

/**
 * plugins/mods/troubleshoot.md § `no command.run hook answered it`: a command a mod added reaches the
 * end of the `command.run` chain with no answer, and Claude Code prints a reply that names the mod and
 * the command and tells the user to add a hook.
 */
describe('a registered command no hook answered', () => {
  const REPLY = /^first-mod registered \/tally but no command\.run hook answered it\. /;

  // The scan reads each hook where it is written, so every module spells its hooks out.
  const noHook = registerOf((on) => {
    on('session.start', async ($: Registered, e: unknown, next: Next) => {
      await $.command.register({ name: 'tally', description: 'Count tool calls' });
      return next(e);
    });
  });
  const otherCommand = registerOf((on) => {
    on('session.start', async ($: Registered, e: unknown, next: Next) => {
      await $.command.register({ name: 'tally', description: 'Count tool calls' });
      return next(e);
    });
    on('command.run', { command: 'other' }, () => ({ text: 'other answered' }));
  });
  const passesOn = registerOf((on) => {
    on('session.start', async ($: Registered, e: unknown, next: Next) => {
      await $.command.register({ name: 'tally', description: 'Count tool calls' });
      return next(e);
    });
    on('command.run', { command: 'tally' }, (_$: unknown, e: unknown, next: Next) => next(e));
  });
  const throwing = registerOf((on) => {
    on('session.start', async ($: Registered, e: unknown, next: Next) => {
      await $.command.register({ name: 'tally', description: 'Count tool calls' });
      return next(e);
    });
    on('command.run', { command: 'tally' }, () => {
      throw new Error('boom');
    });
  });
  const answers = registerOf((on) => {
    on('session.start', async ($: Registered, e: unknown, next: Next) => {
      await $.command.register({ name: 'tally', description: 'Count tool calls' });
      return next(e);
    });
    on('command.run', { command: 'tally' }, () => ({ text: 'Tally: 3' }));
  });

  const runTally = async (register: typeof noHook) => {
    const s = session({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    const text = await s.host.runCommand('tally', '', {
      core: () => Promise.resolve({ text: 'host command' }),
    });
    return { text: record(text).text, reports: s.reports, host: s.host };
  };

  spec('mods.troubleshoot.no command.run hook answered it', () => {
    test('the module has no command.run hook: the reply names the mod and the command and tells the user to add a hook', async () => {
      const { text } = await runTally(noHook);
      expect(text).toMatch(REPLY);
      expect(String(text)).toContain('Add a command.run hook');
    });

    test("the hook's filter names a different command: the same reply", async () => {
      expect((await runTally(otherCommand)).text).toMatch(REPLY);
    });

    test('the hook returned next(e): the same reply', async () => {
      expect((await runTally(passesOn)).text).toMatch(REPLY);
    });

    test('Claude Code skipped the hook, so "hook skipped" lists the reason: the reply and the line both appear', async () => {
      const { text, reports } = await runTally(throwing);
      expect(text).toMatch(REPLY);
      expect(reports.map((report) => report.line)).toEqual([
        'first-mod: command.run hook skipped: threw Error: boom',
      ]);
    });

    test('a hook that answers has its text printed, and the command is not reported unanswered', async () => {
      expect((await runTally(answers)).text).toBe('Tally: 3');
    });

    test('a command no mod registered ends in the behaviour of the host, not in this reply', async () => {
      const { host } = await runTally(noHook);
      const out = await host.runCommand('help', '', {
        core: () => Promise.resolve({ text: 'host help' }),
      });
      expect(out).toEqual({ text: 'host help' });
    });
  });
});

// claude-code/index.d.ts:1836 (`CommandRunInput`): `command` "A rewrite is refused"; `origin` and
// `presentation` the engine stamps, `next(e)` passes them on. Declarations, outside `spec(...)`
// (spec/judgments.md, `commandRunPins`).
describe('command.run as declared', () => {
  const tallyMod = (hook: (e: Record<string, unknown>, next: Next) => unknown) =>
    registerOf((on) => {
      on('session.start', async ($: Registered, e: unknown, next: Next) => {
        await $.command.register({ name: 'tally', description: 'Count tool calls' });
        return next(e);
      });
      on('command.run', { command: 'tally' }, (_$: unknown, e: unknown, next: Next) =>
        hook(record(e), next),
      );
    });
  const ran = async (register: ReturnType<typeof tallyMod>, origin?: { kind: string }) => {
    const s = session({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    const seen: unknown[] = [];
    const out = await s.host.runCommand('tally', '2', {
      core: (e) => (seen.push(e), Promise.resolve({ text: 'host' })),
      ...(origin ? { origin } : {}),
    });
    return { out, seen, lines: s.reports.map((report) => report.line) };
  };

  test('a hook that passes on a changed command fails: the rewrite is refused', async () => {
    const { out, lines } = await ran(tallyMod((e, next) => next({ ...e, command: 'help' })));
    expect(String(record(out).text)).toContain(
      'first-mod registered /tally but no command.run hook answered it',
    );
    expect(lines).toEqual([
      'first-mod: command.run hook skipped: threw Error: next argument: command.run: a hook may not rewrite e.command, only e.args',
    ]);
  });

  test('the event carries the origin the host stamped and the presentation of its window', async () => {
    const seen: unknown[] = [];
    await ran(
      tallyMod((e) => (seen.push(e), { text: 'ok' })),
      { kind: 'composer' },
    );
    expect(seen).toEqual([
      {
        command: 'tally',
        args: '2',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns: 120 },
      },
    ]);
  });

  test('an origin the host did not stamp is unclassified', async () => {
    const seen: unknown[] = [];
    await ran(tallyMod((e) => (seen.push(e.origin), { text: 'ok' })));
    expect(seen).toEqual([{ kind: 'unclassified' }]);
  });

  test('a changed presentation is refused; one left out is kept for Claude Code', async () => {
    const changed = await ran(
      tallyMod((e, next) => next({ ...e, presentation: { isFullscreen: false, columns: 9 } })),
    );
    expect(changed.lines[0]).toContain('e.presentation is pinned');
    const h = eventHarness();
    h.mod('my-mod', 'user', [
      fn('command.run', (_$, e, next) => {
        const { presentation: _left, origin: _out, ...rest } = e;
        return next({ ...rest, args: 'x' });
      }),
    ]);
    const presentation = { isFullscreen: true, columns: 100 };
    const origin = { kind: 'sdk' };
    await h.fire('command.run', { command: 'c', args: '', origin, presentation });
    expect(h.coreSeen).toEqual([{ command: 'c', args: 'x', origin, presentation }]);
  });
});
