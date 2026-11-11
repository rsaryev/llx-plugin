/**
 * hooks.md § "Response schema" (prompt-based hooks): `ok`, `reason`, `impossible`, and what `ok:
 * false` does on Stop and PreToolUse. A `prompt` hook (an `agent` hook where the bullet says it
 * behaves alike) is fired through the real engine with a model that answers from a script.
 */
import { expect, test } from 'bun:test';
import { agentHook, answer, fireModelHook, promptHook } from '../../support/hooks-model-fire.ts';
import { spec } from '../../support/spec.ts';

const NO = answer({ ok: false, reason: 'The tests are failing' });
const IMPOSSIBLE = answer({ ok: false, reason: 'The repo has no tests', impossible: true });
const REASON = 'The tests are failing';

spec('hooks.behavior.Response schema.ok', () => {
  test('the model is asked for the JSON with ok, and a prompt hook sends the schema with the prompt', async () => {
    const { models } = await fireModelHook('Stop', promptHook(), answer({ ok: true }));
    expect(models.calls[0]?.prompt).toContain('"ok"');
    expect(models.calls[0]?.prompt).toContain('"reason"');
  });

  test.each([
    'Stop',
    'SubagentStop',
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'TeammateIdle',
  ] as const)('%s: ok: true allows, and nothing is held back, ended or added', async (event) => {
    const { outcome } = await fireModelHook(event, promptHook(), answer({ ok: true }));
    expect(outcome.proceed).toBe(true);
    expect(outcome.continue).toBe(true);
    expect(outcome.block).toBeUndefined();
    expect(outcome.feedback).toEqual([]);
    expect(outcome.effects).toEqual({});
  });

  test('a reply wrapped in a Markdown code fence is read as the JSON inside', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook(), {
      text: '```json\n{"ok": false, "reason": "keep going"}\n```',
    });
    expect(outcome.block).toMatchObject({ reason: 'keep going' });
  });

  test.each([
    ['prose around the JSON', 'Sure! {"ok": true}'],
    ['no ok', '{"reason": "fine"}'],
    ['an ok that is not a boolean', '{"ok": "yes"}'],
    ['text that is not JSON', 'all good'],
  ])(
    '%s is no verdict: the hook ends as a non-blocking error and the action goes ahead',
    async (_name, text) => {
      const { outcome } = await fireModelHook('PreToolUse', promptHook(), { text });
      expect(outcome.proceed).toBe(true);
      expect(outcome.runs.map((run) => run.status)).toEqual(['non-blocking-error']);
      expect(outcome.notices).toHaveLength(1);
    },
  );

  test('an agent hook answers in the same schema', async () => {
    const { outcome } = await fireModelHook('Stop', agentHook, NO);
    expect(outcome.block).toMatchObject({ reason: REASON });
  });
});

spec('hooks.behavior.Response schema.reason', () => {
  test('ok: false with a reason: the reason is what Claude is told', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook(), NO);
    expect(outcome.block?.reason).toBe(REASON);
    expect(outcome.block?.message).toContain(REASON);
  });

  test.each([
    ['no reason', '{"ok": false}'],
    ['an empty reason', '{"ok": false, "reason": ""}'],
    ['a blank reason', '{"ok": false, "reason": "   "}'],
  ])(
    'ok: false with %s is not a valid answer: required when ok is false, so it blocks nothing',
    async (_name, text) => {
      const { outcome } = await fireModelHook('Stop', promptHook(), { text });
      expect(outcome.proceed).toBe(true);
      expect(outcome.block).toBeUndefined();
      expect(outcome.notices[0]?.message).toContain('reason');
    },
  );

  test('ok: true needs no reason, and one given changes nothing', async () => {
    const bare = await fireModelHook('Stop', promptHook(), answer({ ok: true }));
    const given = await fireModelHook(
      'Stop',
      promptHook(),
      answer({ ok: true, reason: 'all fine' }),
    );
    expect(bare.outcome.block).toBeUndefined();
    expect(given.outcome.block).toBeUndefined();
    expect(given.outcome.feedback).toEqual([]);
  });
});

spec('hooks.behavior.Response schema.impossible', () => {
  test.each(['Stop', 'SubagentStop'] as const)(
    '%s: ok: false with impossible: true lets the turn end instead of feeding the reason back',
    async (event) => {
      const { outcome } = await fireModelHook(event, promptHook(), IMPOSSIBLE);
      expect(outcome.proceed).toBe(true);
      expect(outcome.block).toBeUndefined();
      expect(outcome.runs.map((run) => run.status)).toEqual(['success']);
    },
  );

  test('without impossible, or with impossible: false, the reason is fed back', async () => {
    for (const body of [
      { ok: false, reason: 'r' },
      { ok: false, reason: 'r', impossible: false },
    ]) {
      const { outcome } = await fireModelHook('Stop', promptHook(), answer(body));
      expect(outcome.block).toMatchObject({ reason: 'r' });
    }
  });

  test('agent hooks ignore it', async () => {
    const { outcome } = await fireModelHook('Stop', agentHook, IMPOSSIBLE);
    expect(outcome.block).toMatchObject({ reason: 'The repo has no tests' });
  });

  test.each([
    'PreToolUse',
    'PostToolUse',
    'PostToolBatch',
    'UserPromptSubmit',
    'TaskCreated',
    'TeammateIdle',
  ] as const)('%s ignores it: ok: false acts as it does without it', async (event) => {
    const plain = await fireModelHook(event, promptHook(), NO);
    const flagged = await fireModelHook(event, promptHook(), IMPOSSIBLE);
    expect(flagged.outcome.proceed).toBe(plain.outcome.proceed);
    expect(flagged.outcome.continue).toBe(plain.outcome.continue);
    expect(flagged.outcome.block !== undefined).toBe(plain.outcome.block !== undefined);
  });

  test('it is optional and a boolean', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook(), {
      text: '{"ok": false, "reason": "r", "impossible": "yes"}',
    });
    expect(outcome.runs.map((run) => run.status)).toEqual(['non-blocking-error']);
  });
});

spec('hooks.behavior.Response schema.Stop', () => {
  test('ok: false: the reason is fed back to Claude as its next instruction and the turn continues', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook(), NO);
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ via: 'decision', to: 'claude', reason: REASON });
    expect(outcome.continue).toBe(true);
  });

  test('SubagentStop does the same for the subagent', async () => {
    const { outcome } = await fireModelHook('SubagentStop', promptHook(), NO);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
    expect(outcome.continue).toBe(true);
  });

  test('impossible: true allows the stop and the turn ends', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook(), IMPOSSIBLE);
    expect(outcome.proceed).toBe(true);
  });

  test('continueOnBlock changes nothing here: the turn goes on either way', async () => {
    const { outcome } = await fireModelHook('Stop', promptHook({ continueOnBlock: true }), NO);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
    expect(outcome.continue).toBe(true);
  });
});

spec('hooks.behavior.Response schema.PreToolUse', () => {
  test('ok: false denies the call; by default the turn ends and the deny reason appears as a warning line', async () => {
    const { outcome } = await fireModelHook('PreToolUse', promptHook(), NO);
    expect(outcome.proceed).toBe(false);
    expect(outcome.effects.permissionDecision).toBe('deny');
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe(REASON);
  });

  test('continueOnBlock: true returns the reason to Claude as the tool error so it can adjust and continue, like a command hook deny', async () => {
    const { outcome } = await fireModelHook(
      'PreToolUse',
      promptHook({ continueOnBlock: true }),
      NO,
    );
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ to: 'claude', reason: REASON });
    expect(outcome.effects).toMatchObject({
      permissionDecision: 'deny',
      permissionDecisionReason: REASON,
    });
    expect(outcome.continue).toBe(true);
  });

  test('an agent hook is handled as a prompt hook with continueOnBlock: true', async () => {
    const { outcome } = await fireModelHook('PreToolUse', agentHook, NO);
    expect(outcome.proceed).toBe(false);
    expect(outcome.continue).toBe(true);
  });
});
