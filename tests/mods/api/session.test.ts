/**
 * `$.session`, `$.prompt`, `$.turn` and `$.config`.
 * plugins/mods/api.md § Send and receive messages between sessions (`$.session.send({ to, text })`
 * with `{ sessionId }`, `{ agentId }` or the sender's string address; "resolves once the message is
 * queued, with `{ isDelivered: true }`. When nothing was delivered, it resolves with `{ isDelivered:
 * false, reason }`"), § Start a turn from a background job (`$.prompt.submit({ text })`, `asUser:
 * true`), § Reach files, processes, and the network (`$.session.messages()` returns the transcript
 * as `{ role, text, toolUses }`); plugins/mods/reference.md § Mods API methods (`$.session`
 * methods; `usage()` returns `{ startedAt, context, rateLimits, cost }`), § Limits
 * (`$.session.messages()`: the newest 4,096 entries); plugins/mods/test.md § Look up what a stub
 * returns (`session.send` takes the event's result and `e.to` arrives as a string; `prompt.fill`
 * takes `{ isFilled }`; `$.prompt.read` resolves to `{ text, cursor }`).
 */
import { expect, test } from 'bun:test';
import type { ModSession, SessionEntry } from '../../../src/mods/api/index.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { MOD_LIMITS } from '../../../src/protocol/mods-limits.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods, field } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const entry = (index: number): SessionEntry => ({ role: 'user', text: `m${index}`, toolUses: [] });
const unscripted = () => Promise.reject(new Error('unscripted'));

const sessionPort = (over: Partial<ModSession> = {}): ModSession => ({
  messages: () => Promise.resolve([entry(0)]),
  cwd: () => Promise.resolve('/work'),
  root: () => Promise.resolve('/work'),
  model: () => Promise.resolve('claude-test'),
  turns: () => Promise.resolve(3),
  id: () => Promise.resolve('abc123'),
  repo: () => Promise.resolve({ branch: 'main' }),
  surfaces: () => Promise.resolve(['terminal']),
  usage: () =>
    Promise.resolve({
      startedAt: 1,
      context: { tokens: 10, window: 200, percent: 5 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: 99 }],
      cost: 0.5,
    }),
  version: () => Promise.resolve('2.1.319'),
  compact: () => Promise.resolve(),
  send: unscripted,
  append: () => Promise.resolve(),
  authorize: () => Promise.resolve({ isAuthorized: true }),
  ...over,
});

spec('mods.api.$.session', () => {
  test('$.session has the fourteen methods of the reference', async () => {
    const { api } = await apiHarness({ ports: { session: sessionPort() } });
    expectMethods(api.session, MODS_API.session);
  });

  test('the plain questions answer from the host: cwd, root, model, turns, id, repo, surfaces, version', async () => {
    const { api } = await apiHarness({ ports: { session: sessionPort() } });
    expect(
      await Promise.all([
        api.session.cwd(),
        api.session.root(),
        api.session.model(),
        api.session.turns(),
        api.session.id(),
        api.session.repo(),
        api.session.surfaces(),
        api.session.version(),
      ]),
    ).toEqual([
      '/work',
      '/work',
      'claude-test',
      3,
      'abc123',
      { branch: 'main' },
      ['terminal'],
      '2.1.319',
    ]);
  });

  test('usage resolves to { startedAt, context, rateLimits, cost } as the host gave it', async () => {
    const { api } = await apiHarness({ ports: { session: sessionPort() } });
    expect(await api.session.usage()).toMatchObject({
      context: { tokens: 10, window: 200, percent: 5 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: 99 }],
    });
  });

  test('messages returns { role, text, toolUses } entries', async () => {
    const { api } = await apiHarness({ ports: { session: sessionPort() } });
    expect(await api.session.messages()).toEqual([{ role: 'user', text: 'm0', toolUses: [] }]);
  });

  test('send to { sessionId } fires session.send with e.to as the id string and resolves to { isDelivered: true }', async () => {
    const sent: unknown[] = [];
    const h = await apiHarness({
      ports: {
        session: sessionPort({
          send: (to, text) => (sent.push([to, text]), Promise.resolve({ isDelivered: true })),
        }),
      },
    });
    const seen: unknown[] = [];
    await h.mod('spy', 'prepend', [fn('session.send', (_$, e, next) => (seen.push(e), next(e)))]);
    expect(
      await h.api.session.send({ to: { sessionId: 's-9' }, text: 'Status? One line.' }),
    ).toEqual({ isDelivered: true });
    expect(seen).toEqual([{ to: 's-9', text: 'Status? One line.' }]);
    expect(sent).toEqual([['s-9', 'Status? One line.']]);
  });

  test('send to { agentId } and to the string address a message came from', async () => {
    const targets: string[] = [];
    const h = await apiHarness({
      ports: {
        session: sessionPort({
          send: (to) => (targets.push(to), Promise.resolve({ isDelivered: true })),
        }),
      },
    });
    await h.api.session.send({ to: { agentId: 'ag-1' }, text: 'hi' });
    await h.api.session.send({ to: 'peer@host', text: 'hi' });
    expect(targets).toEqual(['ag-1', 'peer@host']);
  });

  test('when nothing was delivered the call resolves with { isDelivered: false, reason }', async () => {
    const reason =
      'Agent "ag-1" was not resumed: the session was stopped and nobody has sent input since.';
    const h = await apiHarness({
      ports: {
        session: sessionPort({ send: () => Promise.resolve({ isDelivered: false, reason }) }),
      },
    });
    expect(await h.api.session.send({ to: { agentId: 'ag-1' }, text: 'hi' })).toEqual({
      isDelivered: false,
      reason,
    });
  });

  test('a send without a target or text rejects', async () => {
    const h = await apiHarness({ ports: { session: sessionPort() } });
    expect(await rejection(h.api.session.send({ text: 'hi' }))).toContain('$.session.send');
    expect(await rejection(h.api.session.send({ to: { sessionId: 's' } }))).toContain(
      '$.session.send',
    );
  });

  test('a hook on session.send answers with the event result, as a stub does', async () => {
    const h = await apiHarness({ ports: { session: sessionPort() } });
    await h.mod('stub', 'prepend', [fn('session.send', () => ({ isDelivered: true }))]);
    expect(await h.api.session.send({ to: 'x', text: 'y' })).toEqual({ isDelivered: true });
  });

  test('append, compact and authorize reach the host', async () => {
    const seen: string[] = [];
    const h = await apiHarness({
      ports: {
        session: sessionPort({
          append: (row) => (seen.push(`append ${JSON.stringify(row)}`), Promise.resolve()),
          compact: () => (seen.push('compact'), Promise.resolve()),
          authorize: (request) => (
            seen.push(`authorize ${JSON.stringify(request)}`),
            Promise.resolve({ isAuthorized: false })
          ),
        }),
      },
    });
    await h.api.session.append({ type: 'user', message: { content: 'hi' } });
    await h.api.session.compact();
    expect(await h.api.session.authorize({ action: 'x' })).toEqual({ isAuthorized: false });
    expect(seen).toEqual([
      'append {"type":"user","message":{"content":"hi"}}',
      'compact',
      'authorize {"action":"x"}',
    ]);
  });
});

const all = (count: number) => Array.from({ length: count }, (_, index) => entry(index));

spec('mods.limit.$.session.messages()', () => {
  test('a transcript of 4,096 entries comes back whole', async () => {
    const { api } = await apiHarness({
      ports: {
        session: sessionPort({ messages: () => Promise.resolve(all(MOD_LIMITS.messages)) }),
      },
    });
    expect(await api.session.messages()).toHaveLength(MOD_LIMITS.messages);
  });

  test('a longer one comes back as its newest 4,096 entries', async () => {
    const { api } = await apiHarness({
      ports: {
        session: sessionPort({ messages: () => Promise.resolve(all(MOD_LIMITS.messages + 10)) }),
      },
    });
    const rows = await api.session.messages();
    expect(rows).toHaveLength(MOD_LIMITS.messages);
    expect(rows).toMatchObject({ 0: { text: 'm10' } });
    expect(field(rows, String(MOD_LIMITS.messages - 1))).toMatchObject({
      text: `m${MOD_LIMITS.messages + 9}`,
    });
  });
});
