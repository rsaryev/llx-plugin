/**
 * The command and `/config` events. plugins/mods/reference.md § Commands and configuration;
 * plugins/mods/api.md § Add a command; plugins/mods/events.md § Handle a hook that fails (a
 * `config.set` guard). Which row the user changes and when a command list is built is the host's.
 */
import { describe, expect, test } from 'bun:test';
import { eventInputProblem } from '../../../src/mods/events/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

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
      expect(eventInputProblem('command.run', run)).toBeUndefined();
      expect(eventInputProblem('command.run', { args: '' })).toContain('command');
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
