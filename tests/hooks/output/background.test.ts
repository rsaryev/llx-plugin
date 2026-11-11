/**
 * hooks.md § "How async hooks execute": "Claude Code delivers the `additionalContext` and
 * `systemMessage` fields from the hook's JSON response to Claude on the next conversation turn";
 * an `asyncRewake` hook that exits with code 2 "wakes Claude" with its stderr or stdout.
 * `settleDeliveries` is how a host consumes `HookOutcome.background`; no requirement id covers it,
 * so it sits outside `spec(...)`. Joining several wakes is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { groupDeliveries, settleDeliveries } from '../../../src/hooks/output/background.ts';

describe('groupDeliveries', () => {
  test('collects the contexts and the system messages in order, and no wake when none woke', () => {
    expect(
      groupDeliveries([
        { outcome: 'completed' as const, handlerId: 'a', additionalContext: 'Tests passed' },
        {
          outcome: 'completed' as const,
          handlerId: 'b',
          systemMessage: 'Lint ran',
          additionalContext: 'No findings',
        },
        { outcome: 'completed' as const, handlerId: 'c' },
      ]),
    ).toEqual({
      additionalContext: ['Tests passed', 'No findings'],
      systemMessages: ['Lint ran'],
    });
  });

  test('a wake is surfaced apart from the context; several wakes join with a newline', () => {
    const settled = groupDeliveries([
      { outcome: 'completed' as const, handlerId: 'a', wake: 'deploy failed' },
      { outcome: 'completed' as const, handlerId: 'b', additionalContext: 'note' },
      { outcome: 'completed' as const, handlerId: 'c', wake: 'disk full' },
    ]);
    expect(settled.wake).toBe('deploy failed\ndisk full');
    expect(settled.additionalContext).toEqual(['note']);
  });

  test('nothing delivered is empty lists with no wake key', () => {
    expect(groupDeliveries([])).toEqual({ additionalContext: [], systemMessages: [] });
  });
});

describe('settleDeliveries', () => {
  test('waits for every promise and keeps the order of the promises', async () => {
    const { promise: slow, resolve: later } = Promise.withResolvers<{
      outcome: 'completed';
      handlerId: string;
      additionalContext: string;
    }>();
    const fast = Promise.resolve({
      outcome: 'completed' as const,
      handlerId: 'fast',
      additionalContext: 'second',
    });
    const settling = settleDeliveries([slow, fast]);
    later({ outcome: 'completed' as const, handlerId: 'slow', additionalContext: 'first' });
    expect((await settling).additionalContext).toEqual(['first', 'second']);
  });

  test('a promise that rejects delivers nothing and does not hide the others', async () => {
    const settled = await settleDeliveries([
      Promise.reject(new Error('process vanished')),
      Promise.resolve({ outcome: 'completed' as const, handlerId: 'ok', systemMessage: 'done' }),
    ]);
    expect(settled).toEqual({ additionalContext: [], systemMessages: ['done'] });
  });

  test('no promises settle at once to nothing', async () => {
    expect(await settleDeliveries([])).toEqual({ additionalContext: [], systemMessages: [] });
  });
});
