/**
 * What the kit decides where the docs are silent about the mods API (spec/judgments.md). None of
 * these is under `spec(...)`: a judgment is never compatibility.
 */
import { describe, expect, test } from 'bun:test';
import type { CommandRun } from '../../../src/ports/index.ts';
import type { ModelCall } from '../../../src/mods/api/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { apiHarness, exited } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';

describe('commands, tools and subagent types', () => {
  test('a command name another mod registered is refused, naming that mod', async () => {
    const h = await apiHarness();
    const other = await h.mod('other-mod', 'user', []);
    await other.api.command.register({ name: 'standup' });
    expect(await rejection(h.api.command.register({ name: 'standup' }))).toContain(
      '"/standup" refused: it is already registered by other-mod',
    );
  });

  test('the same mod registering a command again replaces it (a reloaded module)', async () => {
    const h = await apiHarness();
    await h.api.command.register({ name: 'standup', description: 'one' });
    await h.api.command.register({ name: 'standup', description: 'two' });
    expect(h.shared.registries.commands.list()).toHaveLength(1);
    expect(h.shared.registries.commands.get('standup')).toMatchObject({ description: 'two' });
  });

  test('unloading a mod forgets what it registered', async () => {
    const h = await apiHarness();
    await h.api.command.register({ name: 'standup' });
    await h.api.tool.register({ name: 't', description: 'd', inputSchema: {} });
    await h.api.agent.register({ name: 'reviewer', description: 'd', prompt: 'p' });
    h.handle.dispose();
    expect(h.shared.registries.commands.list()).toHaveLength(0);
    expect(h.shared.registries.tools.list()).toHaveLength(0);
    expect(h.shared.registries.agents.list()).toHaveLength(0);
  });
});

describe('the model', () => {
  const answered = { isAnswered: true as const, text: 'ok', usage: {} };
  const port = (calls: ModelCall[]) => ({
    complete: (call: ModelCall) => (calls.push(call), Promise.resolve(answered)),
    fork: () => Promise.resolve(answered),
    classify: (request: unknown) => Promise.resolve({ label: 'x', request }),
  });

  test('a maxTokens above 64,000 is cut to 64,000: the model output limit the docs add is the host', async () => {
    const calls: ModelCall[] = [];
    const h = await apiHarness({ ports: { models: port(calls) } });
    await h.api.model.complete({ model: 'haiku', prompt: 'x', maxTokens: 100_000 });
    expect(calls[0]?.maxTokens).toBe(64_000);
  });

  test('a hook that raises maxTokens past the cap is cut at the cap too', async () => {
    const calls: ModelCall[] = [];
    const h = await apiHarness({ ports: { models: port(calls) } });
    await h.mod('greedy', 'prepend', [
      fn('model.complete', (_$, e, next) => next({ ...e, maxTokens: 999_999 })),
    ]);
    await h.api.model.complete({ model: 'haiku', prompt: 'x' });
    expect(calls[0]?.maxTokens).toBe(64_000);
  });

  test('classify hands its one object to the host', async () => {
    const h = await apiHarness({ ports: { models: port([]) } });
    expect(await h.api.model.classify({ text: 'x', labels: ['a', 'b'] })).toEqual({
      label: 'x',
      request: { text: 'x', labels: ['a', 'b'] },
    });
  });
});

describe('processes and files', () => {
  test('a timeout over 10 minutes is cut to 10 minutes', async () => {
    const runs: CommandRun[] = [];
    const runner = { run: (run: CommandRun) => (runs.push(run), Promise.resolve(exited())) };
    const h = await apiHarness({ ports: { runner } });
    await h.api.process.run(['a'], { timeoutMs: 3_600_000 });
    expect(runs[0]?.timeoutMs).toBe(600_000);
  });

  test('a missing file or directory rejects naming the path', async () => {
    const fs = {
      read: () => Promise.resolve(undefined),
      list: () => Promise.resolve(undefined),
      write: () => Promise.resolve(),
      stat: () => Promise.resolve(undefined),
      exists: () => Promise.resolve(false),
      ancestors: () => Promise.resolve([]),
    };
    const h = await apiHarness({ ports: { fs } });
    expect(await rejection(h.api.fs.read('missing.md'))).toContain(
      '/work/missing.md: no such file',
    );
    expect(await rejection(h.api.fs.list('nowhere'))).toContain('/work/nowhere: no such directory');
  });
});

describe('events', () => {
  test('engine.create names the mod being built', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness();
    await h.mod('watcher', 'prepend', [
      fn('engine.create', (_$, e, next) => (seen.push(e), next(e))),
    ]);
    await h.mod('b', 'user', []);
    await h.mod('c', 'user', []);
    expect(seen).toEqual([{ plugin: 'b' }, { plugin: 'c' }]);
  });

  test('telemetry.log carries to: collector and the record', async () => {
    const seen: unknown[] = [];
    const telemetry = { log: () => Promise.resolve(), mark: () => Promise.resolve() };
    const h = await apiHarness({ plugin: 'sec-default', tier: 'builtin', ports: { telemetry } });
    await h.mod('observer', 'prepend', [
      fn('telemetry.log', (_$, e, next) => (seen.push(e), next(e)), {
        matcher: { to: 'collector' },
      }),
    ]);
    await h.api.telemetry.log({ event: 'x' });
    expect(seen).toEqual([{ to: 'collector', record: { event: 'x' } }]);
  });

  test('a call whose event Claude Code also fires resolves to an answer that is neither { value } nor { deny }', async () => {
    const h = await apiHarness();
    await h.mod('stub', 'prepend', [fn('session.compact', () => ({ skip: 'not now' }))]);
    expect(await h.api.session.compact()).toEqual({ skip: 'not now' });
  });
});
