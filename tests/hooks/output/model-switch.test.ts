/**
 * hooks.md § "PreModelSwitch decision control" and § "PostModelSwitch decision control". Cancelling
 * the switch and showing the confirmation are the host's; the kit proves the decision, the reason
 * and the context the merge hands it.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { merged, specific } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const decide = (permissionDecision: string, more: object = {}) =>
  specific('PreModelSwitch', { permissionDecision, ...more });

spec('hooks.output.PreModelSwitch.permissionDecision', () => {
  test('deny cancels the switch; allow and ask are handed on', () => {
    expect(merged('PreModelSwitch', [decide('deny')]).block).toMatchObject({ via: 'decision' });
    expect(merged('PreModelSwitch', [decide('allow')]).effects.permissionDecision).toBe('allow');
    expect(merged('PreModelSwitch', [decide('ask')]).effects.permissionDecision).toBe('ask');
    expect(merged('PreModelSwitch', [decide('ask')]).block).toBeUndefined();
  });

  test('a top-level decision: block also cancels the switch', () => {
    const outcome = merged('PreModelSwitch', [{ decision: 'block', reason: 'too costly' }]);
    expect(outcome.effects.permissionDecision).toBe('deny');
    expect(outcome.block).toMatchObject({ reason: 'too costly' });
  });

  test.each([
    [['allow', 'ask'], 'ask'],
    [['allow', 'deny'], 'deny'],
    [['ask', 'deny'], 'deny'],
    [['deny', 'ask', 'allow'], 'deny'],
  ] as const)(
    'hooks that return %j: precedence is deny > ask > allow, so %s',
    (given, expected) => {
      const outcome = merged(
        'PreModelSwitch',
        given.map((decision) => decide(decision)),
      );
      expect(outcome.effects.permissionDecision).toBe(expected);
    },
  );

  test("it doesn't accept defer: validation fails", () => {
    expect(parseHookOutput('PreModelSwitch', decide('defer')).failure).toContain(
      'permissionDecision',
    );
  });

  test("it doesn't accept updatedInput or additionalContext: both are dropped", () => {
    const outcome = merged('PreModelSwitch', [
      decide('allow', { updatedInput: { a: 1 }, additionalContext: 'x' }),
    ]);
    expect(outcome.effects).toEqual({ permissionDecision: 'allow' });
    expect(outcome.additionalContext).toEqual([]);
  });
});

spec('hooks.output.PreModelSwitch.permissionDecisionReason', () => {
  test('for deny it is the reason the switch was blocked', () => {
    const outcome = merged('PreModelSwitch', [
      decide('deny', { permissionDecisionReason: 'Not on this plan' }),
    ]);
    expect(outcome.block).toMatchObject({ reason: 'Not on this plan' });
    expect(outcome.effects.permissionDecisionReason).toBe('Not on this plan');
  });

  test('for ask it is the text of the confirmation prompt', () => {
    const outcome = merged('PreModelSwitch', [
      decide('ask', {
        permissionDecisionReason:
          'Switching now re-sends about 180k tokens to the new model. Continue?',
      }),
    ]);
    expect(outcome.effects.permissionDecisionReason).toBe(
      'Switching now re-sends about 180k tokens to the new model. Continue?',
    );
    expect(outcome.block).toBeUndefined();
  });
});

spec('hooks.output.PostModelSwitch.additionalContext', () => {
  test('is delivered with the next request after the switch, from every hook', () => {
    const outcome = merged('PostModelSwitch', [
      specific('PostModelSwitch', { additionalContext: 'The model now is smaller.' }),
      { plain: { text: 'plain stdout counts too', as: 'context' } },
    ]);
    expect(outcome.additionalContext).toEqual([
      'The model now is smaller.',
      'plain stdout counts too',
    ]);
  });

  test('there is no decision control: a block is dropped', () => {
    expect(merged('PostModelSwitch', [{ decision: 'block', reason: 'x' }]).block).toBeUndefined();
  });
});

describe('judgment: the reason of an allow', () => {
  test('"Ignored for allow" is the host\'s: the merge hands the reason on and blocks nothing', () => {
    const outcome = merged('PreModelSwitch', [decide('allow', { permissionDecisionReason: 'ok' })]);
    expect(outcome.effects).toEqual({
      permissionDecision: 'allow',
      permissionDecisionReason: 'ok',
    });
    expect(outcome.block).toBeUndefined();
  });
});
