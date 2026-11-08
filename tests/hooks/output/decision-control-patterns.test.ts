/**
 * hooks.md § "Decision control", first half: the rows for the top-level `decision`, TeammateIdle and
 * TaskCompleted, TaskCreated, PreToolUse, and the start of the table. One test per row, through the
 * real engine and output stage, with a negative case for each pattern.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { exits } from '../../support/hooks-script.ts';
import { specific, viaEngine } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

spec('hooks.behavior.Decision control', () => {
  describe('top-level decision: UserPromptSubmit, UserPromptExpansion, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, ConfigChange, PreCompact', () => {
    const EVENTS = [
      'UserPromptSubmit',
      'UserPromptExpansion',
      'PostToolUse',
      'PostToolUseFailure',
      'PostToolBatch',
      'Stop',
      'SubagentStop',
      'ConfigChange',
      'PreCompact',
    ] as const;

    test.each(EVENTS.filter((event) => event !== 'ConfigChange'))(
      '%s: decision block with a reason holds the action back, and the reason is passed on',
      async (event) => {
        const outcome = await viaEngine(event, [
          { decision: 'block', reason: 'Test suite must pass before proceeding' },
        ]);
        expect(outcome.proceed).toBe(false);
        expect(outcome.block).toMatchObject({
          via: 'decision',
          reason: 'Test suite must pass before proceeding',
        });
      },
    );

    test('ConfigChange: decision block prevents the change; its reason is accepted but never shown', async () => {
      const outcome = await viaEngine('ConfigChange', [
        {
          decision: 'block',
          reason: 'Configuration changes to project settings require admin approval',
        },
      ]);
      expect(outcome.proceed).toBe(false);
      expect(outcome.block).toMatchObject({ via: 'decision', to: 'none', reason: '', message: '' });
    });

    test.each(EVENTS)(
      '%s: omitting decision, or exiting 0 with no JSON at all, lets the action proceed',
      async (event) => {
        expect((await viaEngine(event, [{}])).block).toBeUndefined();
        expect((await viaEngine(event, [''])).block).toBeUndefined();
      },
    );

    test('"The only value for decision is block": any other value is not a decision', async () => {
      for (const value of ['allow', 'approve', 'deny']) {
        expect(parseHookOutput('Stop', { decision: value }).failure).toContain('decision');
      }
      expect((await viaEngine('Stop', [{ decision: 'approve' }])).block).toBeUndefined();
    });

    test('Stop and SubagentStop also take hookSpecificOutput.additionalContext, feedback that continues the conversation without an error', async () => {
      for (const event of ['Stop', 'SubagentStop'] as const) {
        const outcome = await viaEngine(event, [
          specific(event, { additionalContext: 'Please run the test suite before finishing' }),
        ]);
        expect(outcome.effects.continuesTurn).toBe(true);
        expect(outcome.additionalContext).toEqual(['Please run the test suite before finishing']);
        expect(outcome.block).toBeUndefined();
        expect(outcome.notices).toEqual([]);
      }
    });

    test('the block is held back through the host too: ConfigChange policy_settings can not be blocked', async () => {
      const outcome = await viaEngine('ConfigChange', [{ decision: 'block', reason: 'no' }], {
        source: 'policy_settings',
      });
      expect(outcome.proceed).toBe(true);
      expect(
        (await viaEngine('ConfigChange', [{ decision: 'block' }], { source: 'user_settings' }))
          .proceed,
      ).toBe(false);
    });
  });

  describe('TeammateIdle and TaskCompleted: exit code or continue: false', () => {
    test.each(['TeammateIdle', 'TaskCompleted'] as const)(
      '%s: exit code 2 blocks the action and the stderr goes back as feedback',
      async (event) => {
        const outcome = await exits(
          event,
          2,
          'Build artifact missing. Run the build before stopping.',
        );
        expect(outcome.proceed).toBe(false);
        expect(outcome.block).toMatchObject({
          via: 'exit2',
          to: 'claude',
          reason: 'Build artifact missing. Run the build before stopping.',
        });
      },
    );

    test.each(['TeammateIdle', 'TaskCompleted'] as const)(
      '%s: {"continue": false, "stopReason": ...} stops the teammate entirely and shows the stopReason',
      async (event) => {
        const outcome = await viaEngine(event, [{ continue: false, stopReason: 'Tests are red' }]);
        expect(outcome.continue).toBe(false);
        expect(outcome.stopReason).toBe('Tests are red');
        expect(outcome.block).toBeUndefined();
      },
    );

    test.each(['TeammateIdle', 'TaskCompleted'] as const)(
      '%s: a top-level decision block is not part of the pattern',
      async (event) => {
        const outcome = await viaEngine(event, [{ decision: 'block', reason: 'r' }]);
        expect(outcome.proceed).toBe(true);
        expect(outcome.block).toBeUndefined();
      },
    );

    test('TaskCompleted: continue false carries the stop condition for the host, and nothing else carries one', async () => {
      // The TaskUpdate half is the host's trigger: event-decisions-task.test.ts dispatches both.
      const stops = await viaEngine('TaskCompleted', [{ continue: false, stopReason: 's' }]);
      expect(stops.effects.stopCondition).toBe('teammate-finished-its-turn');
      const goes = await viaEngine('TaskCompleted', [{}]);
      expect(goes.effects.stopCondition).toBeUndefined();
    });
  });

  describe('TaskCreated: exit code or top-level decision', () => {
    test('exit code 2 cancels the task and returns the stderr to Claude', async () => {
      const outcome = await exits('TaskCreated', 2, 'Task subject must start with a ticket number');
      expect(outcome.proceed).toBe(false);
      expect(outcome.block).toMatchObject({ via: 'exit2', to: 'claude' });
      expect(outcome.block?.reason).toBe('Task subject must start with a ticket number');
    });

    test('decision: block cancels the task and returns reason as the message', async () => {
      const outcome = await viaEngine('TaskCreated', [{ decision: 'block', reason: 'No ticket' }]);
      expect(outcome.proceed).toBe(false);
      expect(outcome.block).toMatchObject({ via: 'decision', to: 'claude', reason: 'No ticket' });
    });

    test('continue: false is ignored and Claude keeps working', async () => {
      const outcome = await viaEngine('TaskCreated', [{ continue: false, stopReason: 'halt' }]);
      expect(outcome.continue).toBe(true);
      expect(outcome.stopReason).toBeUndefined();
      expect(outcome.proceed).toBe(true);
    });
  });

  describe('PreToolUse: hookSpecificOutput with permissionDecision', () => {
    test.each(['allow', 'deny', 'ask', 'defer'] as const)(
      'permissionDecision %s and its reason reach the host',
      async (decision) => {
        const outcome = await viaEngine('PreToolUse', [
          specific('PreToolUse', {
            permissionDecision: decision,
            permissionDecisionReason: 'Database writes are not allowed',
          }),
        ]);
        expect(outcome.effects.permissionDecision).toBe(decision);
        expect(outcome.effects.permissionDecisionReason).toBe('Database writes are not allowed');
        expect(outcome.proceed).toBe(decision !== 'deny');
      },
    );

    test('the docs example, deny with a reason, holds the call back and tells Claude why', async () => {
      const outcome = await viaEngine('PreToolUse', [
        specific('PreToolUse', {
          permissionDecision: 'deny',
          permissionDecisionReason: 'Database writes are not allowed',
        }),
      ]);
      expect(outcome.block).toMatchObject({
        to: 'claude',
        reason: 'Database writes are not allowed',
      });
    });

    test('no other event reads permissionDecision', async () => {
      expect(
        parseHookOutput('PostToolUse', specific('PostToolUse', { permissionDecision: 'deny' }))
          .output?.hookSpecificOutput,
      ).toEqual({ hookEventName: 'PostToolUse' });
    });
  });
});
