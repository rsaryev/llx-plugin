/**
 * The session events. plugins/mods/reference.md § Session; plugins/mods/api.md § Send and receive
 * messages between sessions; plugins/mods/admin.md § Know which hooks of a user's mod don't run
 * (`door` on `session.append`); plugins/mods/test.md (what `session.receive` and `session.send` are
 * given). When a session starts, compacts, connects to an app or is measured is the host's: the
 * tests fire each event through the chain the way the host will.
 */
import { describe, expect, test } from 'bun:test';
import { SESSION_END_REASONS, eventInputProblem } from '../../../src/mods/events/index.ts';
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

describe('the events a hook only observes', () => {
  spec('mods.event.session.start', () => {
    test('next(e) lets the session start unchanged', async () => {
      expect(await observed('session.start', {})).toEqual({ core: {} });
    });
  });

  spec(['mods.event.session.attach', 'mods.event.session.detach'], () => {
    test('next(e) passes on an app connecting to or disconnecting from the session', async () => {
      expect(await observed('session.attach', { app: 'desktop' })).toEqual({
        core: { app: 'desktop' },
      });
      expect(await observed('session.detach', { app: 'desktop' })).toEqual({
        core: { app: 'desktop' },
      });
    });
  });

  spec('mods.event.session.measure', () => {
    test('next(e) passes on a measurement after a turn', async () => {
      expect(await observed('session.measure', { usage: { percent: 40 } })).toEqual({
        core: { usage: { percent: 40 } },
      });
    });
  });
});

describe('session.end', () => {
  spec('mods.event.session.end', () => {
    test('e.reason is clear, resume, logout, prompt_input_exit or other', async () => {
      expect([...SESSION_END_REASONS]).toEqual([
        'clear',
        'resume',
        'logout',
        'prompt_input_exit',
        'other',
      ]);
      for (const reason of SESSION_END_REASONS) {
        expect(eventInputProblem('session.end', { reason })).toBeUndefined();
        expect(await observed('session.end', { reason })).toEqual({ core: { reason } });
      }
      expect(eventInputProblem('session.end', { reason: 'branch' })).toContain('reason');
      expect(eventInputProblem('session.end', {})).toContain('reason');
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
      for (const kind of ['peer', 'peer-send-message', 'task-notification', 'scheduled-trigger']) {
        expect(
          eventInputProblem('session.receive', { text: 'x', origin: { kind } }),
        ).toBeUndefined();
      }
      expect(await answered('session.receive', received, { consumed: 3 })).toEqual({
        result: { core: received },
        skipped: true,
      });
      expect(eventInputProblem('session.receive', { text: 'x' })).toContain('origin');
    });
  });

  spec('mods.event.session.send', () => {
    test('e.to, e.text and e.origin.kind (model or plugin) describe the message; next(e) lets it go', async () => {
      expect(eventInputProblem('session.send', sent)).toBeUndefined();
      expect(eventInputProblem('session.send', { ...sent, origin: { kind: 'peer' } })).toContain(
        'origin',
      );
      expect(await observed('session.send', sent)).toEqual({ core: sent });
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

    test('the row carries a message with content, and a door that is a string', () => {
      expect(eventInputProblem('session.append', row)).toBeUndefined();
      expect(eventInputProblem('session.append', { door: 1, message: row.message })).toContain(
        'door',
      );
      expect(eventInputProblem('session.append', { door: 'x' })).toContain('message');
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
