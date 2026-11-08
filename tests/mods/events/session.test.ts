/**
 * The session events. plugins/mods/reference.md § Session; plugins/mods/api.md § Send and receive
 * messages between sessions; plugins/mods/admin.md § Know which hooks of a user's mod don't run
 * (`door` on `session.append`); plugins/mods/test.md (what `session.receive` and `session.send` are
 * given). When a session starts, compacts, connects to an app or is measured is the host's: the
 * tests fire each event through the chain the way the host will.
 */
import { describe, expect, test } from 'bun:test';
import { SESSION_END_REASONS } from '../../../src/mods/events/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { eventHarness, reasonsOf } from '../../support/mods-events.ts';
import { spec } from '../../support/spec.ts';

async function answered(event: string, input: Record<string, unknown>, answer: unknown) {
  const h = eventHarness();
  h.mod('my-mod', 'user', [fn(event, () => Promise.resolve(answer))]);
  return { result: await h.fire(event, input), skipped: reasonsOf(h).length === 1 };
}

const observed = async (event: string, input: Record<string, unknown>) => {
  const h = eventHarness();
  h.mod('my-mod', 'user', [fn(event, (_$, e, next) => next(e))]);
  return h.fire(event, input);
};

/** Claude Code's own behaviour when it could not deliver the message. */
const notDelivered = () => Promise.reject(new Error('not delivered: the session is closed'));

/** The message of the error a promise rejects with, or `undefined` when it resolves. */
const failure = (pending: Promise<unknown>): Promise<string | undefined> =>
  pending.then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

describe('the events a hook only observes', () => {
  spec('mods.event.session.start', () => {
    test('next(e) lets the session start unchanged', async () => {
      expect(await observed('session.start', {})).toEqual({ core: {} });
    });
  });

  spec(['mods.event.session.attach', 'mods.event.session.detach'], () => {
    test('next(e) passes on an app connecting to or disconnecting from the session', async () => {
      expect(await observed('session.attach', {})).toEqual({ core: {} });
      expect(await observed('session.detach', {})).toEqual({ core: {} });
    });
  });

  spec('mods.event.session.measure', () => {
    test('next(e) passes on a measurement after a turn', async () => {
      expect(await observed('session.measure', {})).toEqual({ core: {} });
    });
  });
});

describe('session.end', () => {
  spec('mods.event.session.end', () => {
    test('next(e) lets the session end for every reason, and /branch reports resume', async () => {
      expect(SESSION_END_REASONS).toContain('resume');
      for (const reason of SESSION_END_REASONS) {
        expect(await observed('session.end', { reason })).toEqual({ core: { reason } });
      }
    });
  });
});

describe('session.compact', () => {
  spec('mods.event.session.compact', () => {
    test('{ skip: reason } stops the compaction: Claude Code never compacts', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.compact', () => Promise.resolve({ skip: 'keep the full context' })),
      ]);
      expect(await h.fire('session.compact', {})).toEqual({ skip: 'keep the full context' });
      expect(h.coreSeen).toEqual([]);
    });

    test('a skip that is not a string fails the hook and the conversation is compacted', async () => {
      expect(await answered('session.compact', {}, { skip: true })).toEqual({
        result: { core: {} },
        skipped: true,
      });
    });
  });
});

describe('session.receive and session.send', () => {
  const received = { text: 'Status?', origin: { kind: 'peer-send-message' } };
  const sent = { to: 'session-2', text: 'Status? One line.', origin: { kind: 'plugin' } };

  spec('mods.event.session.receive', () => {
    test('e.text and e.origin.kind are the message and where it came from; { consumed: reason } keeps it from Claude', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.receive', (_$, e) =>
          Promise.resolve({ consumed: `ignored ${String(record(e.origin).kind)}` }),
        ),
      ]);
      expect(await h.fire('session.receive', received)).toEqual({
        consumed: 'ignored peer-send-message',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('next(e) passes the message through unchanged, and a consumed that is not a string fails the hook', async () => {
      expect(await observed('session.receive', received)).toEqual({ core: received });
      expect(await answered('session.receive', received, { consumed: 3 })).toEqual({
        result: { core: received },
        skipped: true,
      });
    });

    test("next(e) rejects when the message isn't delivered: a hook that does not catch it is skipped, one that catches it can answer", async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('session.receive', (_$, e, next) => next(e))]);
      expect(await failure(h.fire('session.receive', received, { core: notDelivered }))).toBe(
        'not delivered: the session is closed',
      );
      expect(reasonsOf(h)).toEqual(['threw Error: not delivered: the session is closed']);

      const catching = eventHarness();
      catching.mod('my-mod', 'user', [
        fn('session.receive', (_$, e, next) => next(e), {
          handler: () => Promise.resolve({ consumed: 'not delivered anyway' }),
        }),
      ]);
      expect(await catching.fire('session.receive', received, { core: notDelivered })).toEqual({
        consumed: 'not delivered anyway',
      });
    });
  });

  spec('mods.event.session.send', () => {
    test('next(e) lets the message go: Claude Code sends what the hook passed on', async () => {
      expect(await observed('session.send', sent)).toEqual({ core: sent });
    });

    test("next(e) rejects when the message isn't delivered: a hook that does not catch it is skipped, one that catches it can answer", async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [fn('session.send', (_$, e, next) => next(e))]);
      expect(await failure(h.fire('session.send', sent, { core: notDelivered }))).toBe(
        'not delivered: the session is closed',
      );
      expect(reasonsOf(h)).toEqual(['threw Error: not delivered: the session is closed']);

      const catching = eventHarness();
      catching.mod('my-mod', 'user', [
        fn('session.send', (_$, e, next) => next(e), {
          handler: () => Promise.resolve({ isDelivered: false, reason: 'quiet hours' }),
        }),
      ]);
      expect(await catching.fire('session.send', sent, { core: notDelivered })).toEqual({
        isDelivered: false,
        reason: 'quiet hours',
      });
    });

    test('{ isDelivered: false, reason } refuses the delivery; the message is never sent', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.send', () => Promise.resolve({ isDelivered: false, reason: 'quiet hours' })),
      ]);
      expect(await h.fire('session.send', sent)).toEqual({
        isDelivered: false,
        reason: 'quiet hours',
      });
      expect(h.coreSeen).toEqual([]);
    });

    test('a refusal with no reason, or a delivered flag that is not a flag, fails the hook', async () => {
      for (const wrong of [{ isDelivered: false }, { isDelivered: 'no', reason: 'x' }]) {
        expect(await answered('session.send', sent, wrong)).toEqual({
          result: { core: sent },
          skipped: true,
        });
      }
      expect((await answered('session.send', sent, { isDelivered: true })).skipped).toBe(false);
    });
  });
});

describe('session.append', () => {
  const row = {
    door: 'prompt',
    message: { role: 'user', content: [{ type: 'text', text: 'my key is sk-123' }] },
  };

  spec('mods.event.session.append', () => {
    test('next({ ...e, message }) with a changed message.content rewrites the text blocks of the stored row', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.append', (_$, e, next) =>
          next({
            ...e,
            message: {
              ...record(e.message),
              content: [{ type: 'text', text: 'my key is [redacted]' }],
            },
          }),
        ),
      ]);
      await h.fire('session.append', row);
      expect(h.coreSeen).toEqual([
        {
          ...row,
          message: { role: 'user', content: [{ type: 'text', text: 'my key is [redacted]' }] },
        },
      ]);
    });

    test('the content of a tool_result block in the row can be rewritten the same way', async () => {
      const toolRow = {
        door: 'tool',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'secret' }],
        },
      };
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.append', (_$, e, next) =>
          next({
            ...e,
            message: {
              ...record(e.message),
              content: [{ type: 'tool_result', tool_use_id: 't1', content: 'hidden' }],
            },
          }),
        ),
      ]);
      await h.fire('session.append', toolRow);
      expect(h.coreSeen).toEqual([
        {
          ...toolRow,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 't1', content: 'hidden' }],
          },
        },
      ]);
    });

    test('a hook matched on door sees only that kind of stored row', async () => {
      const h = eventHarness();
      const seen: unknown[] = [];
      h.mod('my-mod', 'user', [
        fn('session.append', (_$, e, next) => (seen.push(e.door), next(e)), {
          matcher: { door: 'attachment' },
        }),
      ]);
      await h.fire('session.append', row);
      await h.fire('session.append', { ...row, door: 'attachment' });
      expect(seen).toEqual(['attachment']);
    });
  });

  describe('judgment (spec/judgments.md): only message.content can be rewritten', () => {
    test('any other change a hook passes to next is ignored: Claude Code stores the row as fired with the changed content', async () => {
      const h = eventHarness();
      h.mod('my-mod', 'user', [
        fn('session.append', (_$, _e, next) =>
          next({ door: 'elsewhere', message: { role: 'assistant', content: 'rewritten' } }),
        ),
      ]);
      await h.fire('session.append', row);
      expect(h.coreSeen).toEqual([
        { door: 'prompt', message: { role: 'user', content: 'rewritten' } },
      ]);
    });
  });
});
