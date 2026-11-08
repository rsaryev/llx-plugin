/**
 * workflows.md § When a run hits your usage limit: "the run pauses rather than failing that agent: the
 * agents that hit the limit wait for the reset, and no new agents start"; "Requires Claude Code v2.1.271
 * or later; on earlier versions, the affected agents fail"; "While the run waits, its progress line ...
 * show[s] when the limit resets"; the run pauses only when all hold: an interactive session signed in
 * with a claude.ai subscription (not `claude -p`, the Agent SDK, a background session, Remote Control or
 * an agent team teammate), `autoContinueAtUsageLimit` on ("If you turn it off during a wait, the wait
 * ends and the waiting agents fail"), a reset within 24 hours, and "hasn't already waited twice. When it
 * hits the limit a third time, the agent fails."
 */
import { expect, test } from 'bun:test';
import {
  SESSION_KINDS,
  usageLimitDecision,
  type UsageLimitFacts,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

const HOUR = 60 * 60 * 1000;

const holds: UsageLimitFacts = {
  session: 'interactive',
  subscription: true,
  autoContinue: true,
  msUntilReset: 3 * HOUR,
  waitsSoFar: 0,
  releaseHasWait: true,
};

const decide = (change: Partial<UsageLimitFacts>) => usageLimitDecision({ ...holds, ...change });

spec('workflows.behavior.When a run hits your usage limit', () => {
  test('with every condition holding, the run pauses and shows when the limit resets', () => {
    expect(decide({})).toEqual({ pauses: true, msUntilReset: 3 * HOUR });
    expect(decide({ msUntilReset: 90 * 60 * 1000 })).toEqual({
      pauses: true,
      msUntilReset: 90 * 60 * 1000,
    });
  });

  test('only an interactive session pauses: claude -p and the Agent SDK, a background session, Remote Control and a teammate fail the agent', () => {
    for (const session of SESSION_KINDS) {
      const decision = decide({ session });
      expect(decision.pauses).toBe(session === 'interactive');
    }
    const refused = decide({ session: 'background' });
    expect(refused).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['session-not-interactive'],
    });
  });

  test('a session not signed in with a claude.ai subscription fails the agent', () => {
    expect(decide({ subscription: false })).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['no-subscription'],
    });
  });

  test('with autoContinueAtUsageLimit off the agent fails; asked again during a wait after turning it off, the wait ends', () => {
    expect(decide({}).pauses).toBe(true);
    expect(decide({ autoContinue: false })).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['auto-continue-off'],
    });
  });

  test('a reset within 24 hours waits, exactly 24 hours too; a weekly limit that resets further out fails', () => {
    expect(decide({ msUntilReset: 24 * HOUR }).pauses).toBe(true);
    expect(decide({ msUntilReset: 24 * HOUR + 1 })).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['reset-too-far'],
    });
    expect(decide({ msUntilReset: 5 * 24 * HOUR }).pauses).toBe(false);
  });

  test('the run waits twice; the third time it hits the limit the agent fails', () => {
    expect(decide({ waitsSoFar: 0 }).pauses).toBe(true);
    expect(decide({ waitsSoFar: 1 }).pauses).toBe(true);
    expect(decide({ waitsSoFar: 2 })).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['waited-twice'],
    });
  });

  test('a release before v2.1.271 has no wait: the affected agents fail', () => {
    expect(decide({ releaseHasWait: false })).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['old-release'],
    });
  });

  test('when several conditions fail, the failing agent carries every cause in a stable order', () => {
    const decision = decide({ subscription: false, autoContinue: false, waitsSoFar: 3 });
    expect(decision).toEqual({
      pauses: false,
      failsAgent: true,
      causes: ['no-subscription', 'auto-continue-off', 'waited-twice'],
    });
  });
});
