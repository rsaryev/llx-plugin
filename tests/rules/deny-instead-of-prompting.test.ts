/**
 * settings-reference.md § "What else `denyInsteadOfPrompting` stops", "Question and plan tools"
 * ("Claude Code leaves out `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode`, so a session in
 * plan mode can't leave it on its own. A teammate in an agent team keeps `EnterPlanMode` and
 * `ExitPlanMode`"), and § "Messages from `denyInsteadOfPrompting`" (the denial Claude reads, the
 * `stream-json` `decision_reason`, and in auto mode the stop after 20 calls in a row that were
 * refused, which a `-p` run reports as `error_during_execution`). Asserted through `availableTools`,
 * `decide`, `settleClassification` and the refusal count.
 */
import { describe, expect, test } from 'bun:test';
import {
  availableTools,
  createRefusalStreak,
  NO_APPROVAL_SURFACE_DECISION_REASON,
  NO_APPROVAL_SURFACE_DENIAL,
  REFUSAL_STOP_LIMIT,
  REFUSAL_STOP_MESSAGE,
  REFUSAL_STOP_RESULT,
  settleClassification,
  type PermissionClassifier,
  type ToolSession,
} from '../../src/rules/index.ts';
import { bash, decision, deny } from '../support/decide.ts';
import { call } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const TOOLS = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'Bash', 'Read', 'Edit'];
const session = (rest: Partial<ToolSession> = {}): ToolSession => ({
  platform: 'windows',
  rules: [],
  ...rest,
});

spec('permissions.reference.What else denyInsteadOfPrompting stops.Question and plan tools', () => {
  test('with the setting on, the question and plan tools are left out', () => {
    expect(availableTools(TOOLS, session({ denyInsteadOfPrompting: true }))).toEqual([
      'Bash',
      'Read',
      'Edit',
    ]);
  });

  test('a teammate in an agent team keeps EnterPlanMode and ExitPlanMode, not AskUserQuestion', () => {
    expect(
      availableTools(TOOLS, session({ denyInsteadOfPrompting: true, teammate: true })),
    ).toEqual(['EnterPlanMode', 'ExitPlanMode', 'Bash', 'Read', 'Edit']);
  });

  test('with the setting off, every tool stays', () => {
    expect(availableTools(TOOLS, session())).toEqual(TOOLS);
    expect(availableTools(TOOLS, session({ denyInsteadOfPrompting: false }))).toEqual(TOOLS);
  });

  test('a session in plan mode cannot leave it: what would prompt there is denied', () => {
    const ctx = { denyInsteadOfPrompting: true };
    expect(decision('plan', 'Edit', { file_path: '/work/app/a.ts' }, ctx)).toEqual(
      deny('no-approval-surface'),
    );
    expect(decision('plan', 'ExitPlanMode', {}, ctx).outcome).toBe('deny');
  });
});

describe('Messages from denyInsteadOfPrompting', () => {
  spec('permissions.reference.Messages from denyInsteadOfPrompting', () => {
    test('the denial Claude reads and the stream-json decision_reason, verbatim', () => {
      expect(NO_APPROVAL_SURFACE_DENIAL).toBe(
        'Permission for this tool use was denied. It requires approval, and this session has no approval surface',
      );
      expect(NO_APPROVAL_SURFACE_DECISION_REASON).toBe(
        'no approval surface in this session; permission request denied automatically',
      );
    });

    test('they report a call the setting refused: the decision names that reason', () => {
      expect(bash('default', 'npm test', { denyInsteadOfPrompting: true })).toEqual(
        deny('no-approval-surface'),
      );
      // A -p run without the setting is denied for its own reason, which carries no such message.
      expect(bash('default', 'npm test', { cannotPrompt: true, interactive: false })).toEqual(
        deny('prompt-unavailable'),
      );
    });

    test('in auto mode the turn ends after 20 calls in a row that were refused', () => {
      const streak = createRefusalStreak();
      for (let index = 1; index < REFUSAL_STOP_LIMIT; index += 1) {
        expect(streak.record('refused')).toEqual({ outcome: 'continue' });
      }
      expect(streak.record('refused')).toEqual({ outcome: 'stop', message: REFUSAL_STOP_MESSAGE });
      expect(REFUSAL_STOP_LIMIT).toBe(20);
      expect(REFUSAL_STOP_MESSAGE).toBe(
        '20 actions were refused and no work went ahead in between, so Claude stopped.',
      );
    });

    test('work that went ahead in between starts the count over', () => {
      const streak = createRefusalStreak();
      for (let index = 1; index < REFUSAL_STOP_LIMIT; index += 1) streak.record('refused');
      expect(streak.record('went-ahead')).toEqual({ outcome: 'continue' });
      for (let index = 1; index < REFUSAL_STOP_LIMIT; index += 1) {
        expect(streak.record('refused').outcome).toBe('continue');
      }
      expect(streak.record('refused').outcome).toBe('stop');
    });

    test('a -p run reports that turn as error_during_execution', () => {
      expect(REFUSAL_STOP_RESULT).toBe('error_during_execution');
    });

    test("auto mode's fallback to a prompt is a refusal too: a review that ends in a prompt is denied", async () => {
      const approves: PermissionClassifier = { review: () => Promise.resolve('allow') };
      const asks: PermissionClassifier = { review: () => Promise.resolve('ask') };
      const write = call('Write', { file_path: '/work/app/.git/config', content: '' });
      const thenPrompt = { outcome: 'classify', reason: 'hook', thenPrompt: true } as const;
      const prompts = { denyInsteadOfPrompting: true };
      expect(
        await settleClassification(thenPrompt, {
          call: write,
          mode: 'auto',
          classifier: approves,
          prompts,
        }),
      ).toEqual(deny('no-approval-surface'));
      const plain = { outcome: 'classify', reason: 'mode-auto' } as const;
      expect(
        await settleClassification(plain, { call: write, mode: 'auto', classifier: asks, prompts }),
      ).toEqual(deny('no-approval-surface'));
      // The classifier's approval still runs the call.
      expect(
        await settleClassification(plain, {
          call: write,
          mode: 'auto',
          classifier: approves,
          prompts,
        }),
      ).toEqual({ outcome: 'allow', reason: 'mode-auto' });
    });
  });
});
