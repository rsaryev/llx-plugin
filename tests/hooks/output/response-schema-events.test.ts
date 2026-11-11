/**
 * hooks.md § "Response schema" (prompt-based hooks), the per-event bullets of PostToolUse,
 * PostToolBatch, PostToolUseFailure, TaskCompleted, TeammateIdle, PermissionRequest and
 * PermissionDenied: what `ok: false` does on each event, fired through the real engine.
 */
import { describe, expect, test } from 'bun:test';
import { agentHook, answer, fireModelHook, promptHook } from '../../support/hooks-model-fire.ts';
import { spec } from '../../support/spec.ts';

const NO = answer({ ok: false, reason: 'The tests are failing' });
const REASON = 'The tests are failing';

spec('hooks.behavior.Response schema.PostToolUse', () => {
  test('ok: false: by default the turn ends and the reason appears as a warning line', async () => {
    const { outcome } = await fireModelHook('PostToolUse', promptHook(), NO);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe(REASON);
  });

  test('continueOnBlock: true feeds the reason back to Claude and the turn continues instead', async () => {
    const { outcome } = await fireModelHook(
      'PostToolUse',
      promptHook({ continueOnBlock: true }),
      NO,
    );
    expect(outcome.continue).toBe(true);
    expect(outcome.feedback).toMatchObject([{ to: 'claude' }]);
    expect(outcome.feedback[0]?.text).toContain(REASON);
  });

  test('the tool has already run, so nothing is held back', async () => {
    const { outcome } = await fireModelHook('PostToolUse', promptHook(), NO);
    expect(outcome.proceed).toBe(true);
  });
});

spec('hooks.behavior.Response schema.PostToolBatch', () => {
  test('ok: false ends the turn and the reason appears as a warning line', async () => {
    const { outcome } = await fireModelHook('PostToolBatch', promptHook(), NO);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe(REASON);
    expect(outcome.block).toMatchObject({ to: 'user-and-claude', reason: REASON });
  });

  test.each([true, false])(
    'continueOnBlock: %s makes no difference: it ends the turn on decision: block regardless of continue',
    async (continueOnBlock) => {
      const { outcome } = await fireModelHook('PostToolBatch', promptHook({ continueOnBlock }), NO);
      expect(outcome.continue).toBe(false);
    },
  );

  test('UserPromptSubmit and UserPromptExpansion, in the same bullet, end the turn too', async () => {
    for (const event of ['UserPromptSubmit', 'UserPromptExpansion'] as const) {
      const { outcome } = await fireModelHook(event, promptHook({ continueOnBlock: true }), NO);
      expect(outcome.continue).toBe(false);
      expect(outcome.block).toMatchObject({ to: 'user', reason: REASON });
    }
  });
});

spec('hooks.behavior.Response schema.PostToolUseFailure', () => {
  test('ok: false returns the reason to Claude as a tool error and the turn continues', async () => {
    const { outcome } = await fireModelHook('PostToolUseFailure', promptHook(), NO);
    expect(outcome.continue).toBe(true);
    expect(outcome.feedback).toMatchObject([{ to: 'claude' }]);
    expect(outcome.feedback[0]?.text).toContain(REASON);
  });

  test.each([true, false])('regardless of continueOnBlock: %s', async (continueOnBlock) => {
    const { outcome } = await fireModelHook(
      'PostToolUseFailure',
      promptHook({ continueOnBlock }),
      NO,
    );
    expect(outcome.continue).toBe(true);
    expect(outcome.feedback).toHaveLength(1);
  });

  test('TaskCreated, in the same bullet, returns the reason as a tool error and the turn continues', async () => {
    for (const continueOnBlock of [true, false]) {
      const { outcome } = await fireModelHook('TaskCreated', promptHook({ continueOnBlock }), NO);
      expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
      expect(outcome.continue).toBe(true);
    }
  });
});

spec('hooks.behavior.Response schema.TaskCompleted', () => {
  test('fired because a task is marked completed during a turn: the reason is a tool error and the turn continues, regardless of continueOnBlock', async () => {
    for (const continueOnBlock of [true, false]) {
      const { outcome } = await fireModelHook(
        'TaskCompleted',
        promptHook({ continueOnBlock }),
        NO,
        { taskCompletedBy: 'task-update' },
      );
      expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
      expect(outcome.continue).toBe(true);
    }
  });

  test('without the trigger known it is read as the task being marked completed', async () => {
    const { outcome } = await fireModelHook('TaskCompleted', promptHook(), NO);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
  });

  test('fired because a teammate stops: it behaves like TeammateIdle and halts the teammate by default', async () => {
    const { outcome } = await fireModelHook('TaskCompleted', promptHook(), NO, {
      taskCompletedBy: 'teammate-turn',
    });
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe(REASON);
    expect(outcome.block).toBeUndefined();
  });

  test('and with continueOnBlock the reason goes to the teammate, which keeps working', async () => {
    const { outcome } = await fireModelHook(
      'TaskCompleted',
      promptHook({ continueOnBlock: true }),
      NO,
      { taskCompletedBy: 'teammate-turn' },
    );
    expect(outcome.block).toMatchObject({ reason: REASON });
    expect(outcome.continue).toBe(true);
  });
});

spec('hooks.behavior.Response schema.TeammateIdle', () => {
  test('by default the teammate stops and the reason appears as a warning line', async () => {
    const { outcome } = await fireModelHook('TeammateIdle', promptHook(), NO);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe(REASON);
    expect(outcome.block).toBeUndefined();
  });

  test('continueOnBlock: true feeds the reason back to the teammate and keeps it working', async () => {
    const { outcome } = await fireModelHook(
      'TeammateIdle',
      promptHook({ continueOnBlock: true }),
      NO,
    );
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
    expect(outcome.continue).toBe(true);
  });

  test('an agent hook keeps the teammate working', async () => {
    const { outcome } = await fireModelHook('TeammateIdle', agentHook, NO);
    expect(outcome.block).toMatchObject({ reason: REASON });
  });
});

spec('hooks.behavior.Response schema.PermissionRequest', () => {
  test('ok: false has no effect: to deny an approval, use a command hook returning decision.behavior deny', async () => {
    const { outcome, models } = await fireModelHook('PermissionRequest', promptHook(), NO);
    expect(models.calls).toHaveLength(1);
    expect(outcome.proceed).toBe(true);
    expect(outcome.effects).toEqual({});
    expect(outcome.block).toBeUndefined();
  });

  test('continueOnBlock does not give it one', async () => {
    const { outcome } = await fireModelHook(
      'PermissionRequest',
      promptHook({ continueOnBlock: true }),
      NO,
    );
    expect(outcome.effects).toEqual({});
    expect(outcome.proceed).toBe(true);
  });

  describe('agent hooks do not run on this event', () => {
    test('an agent hook is skipped with a warning and the model is never asked', async () => {
      const { outcome, models } = await fireModelHook('PermissionRequest', agentHook, NO);
      expect(models.calls).toEqual([]);
      expect(outcome.runs).toEqual([]);
      expect(outcome.issues).toHaveLength(1);
    });
  });
});

spec('hooks.behavior.Response schema.PermissionDenied', () => {
  test('ok: false has no effect because the denial already happened', async () => {
    const { outcome } = await fireModelHook('PermissionDenied', promptHook(), NO);
    expect(outcome.proceed).toBe(true);
    expect(outcome.effects).toEqual({});
    expect(outcome.block).toBeUndefined();
    expect(outcome.feedback).toEqual([]);
  });

  test('the only output this event reads is retry, which prompt and agent hooks cannot set: their output is discarded', async () => {
    for (const handler of [promptHook(), agentHook]) {
      const { outcome } = await fireModelHook('PermissionDenied', handler, {
        text: JSON.stringify({
          ok: true,
          reason: 'x',
          retry: true,
          hookSpecificOutput: { hookEventName: 'PermissionDenied', retry: true },
        }),
      });
      expect(outcome.effects.retry).toBeUndefined();
    }
  });
});

describe('the events that run prompt hooks are exactly the ones the response schema names', () => {
  test('a prompt hook on an event the bullets do not name is skipped', async () => {
    const { outcome, models } = await fireModelHook('Notification', promptHook(), NO);
    expect(models.calls).toEqual([]);
    expect(outcome.runs).toEqual([]);
  });
});
