/**
 * Judgments of the worker-crash and refusal behaviour (spec/judgments.md): what the docs leave open,
 * tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { createRunGate, REFUSAL_REASONS } from '../../../src/mods/api/index.ts';
import { crashSession } from '../../support/mods-crash.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { numbers } from '../../support/mods-refusal.ts';
import { inline, modPlugin, registerOf } from '../../support/mods-load.ts';
import type { ModsApi } from '../../../src/mods/types.ts';
import type { RegisterFunction } from '../../../src/testing/mods/index.ts';

const quiet = (): RegisterFunction =>
  registerOf((on) => {
    on('tool.call', (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => next(e));
  });

describe('the worker ledger', () => {
  test('a mod unloaded for a crash stays known: /reload-plugins loads it again', async () => {
    const register = quiet();
    const s = crashSession({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    await s.worker.crash({ reason: 'blocked', culprit: 'first-mod' });
    expect(s.host.active()).toEqual([]);
    await s.host.reload();
    expect(s.host.active().map((mod) => mod.name)).toEqual(['first-mod']);
  });

  test('a stop traced to a name that is not loaded counts as untraced', async () => {
    const register = quiet();
    const s = crashSession({ 'first-mod': register });
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    for (let stop = 0; stop < 3; stop += 1) {
      await s.worker.crash({ reason: 'blocked', culprit: 'nobody' });
    }
    expect(s.host.active()).toEqual([]);
    expect(s.notices).toHaveLength(1);
  });

  test('a stop traced to a built-in mod counts as untraced: three of them unload the installed mods, never the built-in one', async () => {
    const register = quiet();
    const s = crashSession({ 'first-mod': register });
    await s.host.registerBuiltIn('native', 'builtin', [
      { event: 'tool.call', isGenerator: false, run: () => ({ result: 'native' }) },
    ]);
    await s.host.load([modPlugin(inline('first-mod'), register)]);
    await s.worker.crash({ reason: 'blocked', culprit: 'native' });
    await s.worker.crash({ reason: 'blocked', culprit: 'native' });
    expect(s.host.active().map((mod) => mod.name)).toEqual(['native', 'first-mod']);
    expect(s.notices).toEqual([]);
    await s.worker.crash({ reason: 'blocked', culprit: 'native' });
    expect(s.host.active().map((mod) => mod.name)).toEqual(['native']);
    expect(s.notices).toHaveLength(1);
  });

  test('a fresh copy that does not load says why in the debug log and stays off', async () => {
    let loads = 0;
    const register = registerOf((on) => {
      loads += 1;
      if (loads > 1) throw new Error('second evaluation fails');
      on('tool.call', (_$: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => next(e));
    });
    const other = quiet();
    const s = crashSession({ 'first-mod': register, 'second-mod': other });
    await s.host.load([
      modPlugin(inline('first-mod'), register),
      modPlugin(inline('second-mod'), other),
    ]);
    await s.worker.crash({ reason: 'blocked', culprit: 'second-mod' });
    expect(s.host.active()).toEqual([]);
    expect(s.debug.some((line) => line.includes('first-mod: hooks module did not load'))).toBe(
      true,
    );
    expect(s.notices.map((notice) => notice.line).at(-1)).toContain('hooks module did not load');
  });
});

describe('the run gate', () => {
  test('input ended beats the budget, the budget the turn limit, the turn limit the interruption', async () => {
    const world = numbers({ turns: 5, cost: 5 });
    const gate = createRunGate(world.port, { maxTurns: 1, maxBudgetUsd: 1 });
    gate.interrupt();
    expect(await gate.refusal()).toBe(REFUSAL_REASONS.budget);
    world.state.cost = 0;
    expect(await gate.refusal()).toBe(REFUSAL_REASONS.maxTurns);
    world.state.turns = 0;
    expect(await gate.refusal()).toBe(REFUSAL_REASONS.stopped);
    gate.endInput();
    world.state.cost = 5;
    expect(await gate.refusal()).toBe(REFUSAL_REASONS.inputEnded);
  });

  test('a cost that is not a number is no spend', async () => {
    const gate = createRunGate(
      { turns: () => Promise.resolve(0), usage: () => Promise.resolve({ cost: 'a lot' }) },
      { maxBudgetUsd: 0 },
    );
    expect(await gate.refusal()).toBeUndefined();
  });

  test('a Bash call names run_in_background in its input too', async () => {
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({
      ports: {
        tools: { call: () => Promise.resolve({ text: 'done' }), check: () => Promise.resolve({}) },
      },
      options: { gate },
    });
    gate.interrupt();
    const answer = await h.api.tool.call({
      tool: 'Bash',
      input: { command: 'sleep 9', run_in_background: true },
    });
    expect(answer).toEqual({
      deny: `Bash was not run: it starts background work, a schedule or a goal, and ${REFUSAL_REASONS.stopped}`,
    });
  });

  test('the same gate serves the mods API of every mod', async () => {
    const gate = createRunGate(numbers().port);
    const h = await apiHarness({
      ports: { agents: { list: () => Promise.resolve([]), spawn: () => Promise.resolve({}) } },
      options: { gate },
    });
    const other: ModsApi = (await h.mod('other', 'user', [])).api;
    gate.interrupt();
    expect(await other.agent.spawn({ type: 'x' })).toEqual({ deny: REFUSAL_REASONS.stopped });
    expect(await h.api.agent.spawn({ type: 'x' })).toEqual({ deny: REFUSAL_REASONS.stopped });
  });
});
