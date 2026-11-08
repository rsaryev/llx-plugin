/**
 * hooks.md § "UserPromptSubmit decision control", § "UserPromptExpansion decision control",
 * § "Stop decision control", § "ConfigChange decision control", § "PreModelSwitch decision
 * control" and § "PostModelSwitch decision control". Showing the block message, writing the title
 * and cancelling the switch are the host's; the kit proves what the merge hands it.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { merged, specific, viaEngine } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const facts = (source: string) => ({ source });
const prompt = (fields: object, top: object = {}) => ({
  ...top,
  ...specific('UserPromptSubmit', fields),
});

describe.each(['UserPromptSubmit', 'UserPromptExpansion'] as const)('%s', (event) => {
  spec(`hooks.output.${event}.decision`, () => {
    test('block stops the prompt before it reaches Claude, and the only value is block', () => {
      const outcome = merged(event, [{ decision: 'block', reason: 'No secrets in prompts' }]);
      expect(outcome.block).toMatchObject({ via: 'decision', reason: 'No secrets in prompts' });
      expect(merged(event, [{}]).block).toBeUndefined();
    });

    test('a hook that blocks and one that does not: the prompt is blocked', () => {
      expect(merged(event, [{}, { decision: 'block', reason: 'r' }]).block?.reason).toBe('r');
    });

    test('a value outside approve and block fails validation', () => {
      expect(parseHookOutput(event, { decision: 'deny' }).failure).toContain('decision');
    });
  });

  spec(`hooks.output.${event}.reason`, () => {
    test('is shown to the user when decision is block, and is not added to context', async () => {
      const outcome = await viaEngine(event, [
        { decision: 'block', reason: 'Explanation for decision' },
      ]);
      expect(outcome.proceed).toBe(false);
      expect(outcome.block).toMatchObject({ to: 'user', reason: 'Explanation for decision' });
      expect(outcome.additionalContext).toEqual([]);
      expect(outcome.feedback).toEqual([]);
    });

    test('alone it blocks nothing', () => {
      expect(merged(event, [{ reason: 'note' }]).block).toBeUndefined();
    });
  });

  spec(`hooks.output.${event}.additionalContext`, () => {
    test("is added to Claude's context alongside the prompt, from every hook", () => {
      const one = specific(event, { additionalContext: 'My additional context here' });
      const two = specific(event, { additionalContext: 'more' });
      expect(merged(event, [one, two]).additionalContext).toEqual([
        'My additional context here',
        'more',
      ]);
    });

    test('plain stdout on exit 0 reaches Claude the same way', () => {
      const outcome = merged(event, [{ plain: { text: 'branch: main', as: 'context' } }]);
      expect(outcome.additionalContext).toEqual(['branch: main']);
    });
  });
});

spec('hooks.output.UserPromptSubmit.sessionTitle', () => {
  test('names the session, in the documented example', () => {
    const outcome = merged('UserPromptSubmit', [
      prompt(
        {
          additionalContext: 'My additional context here',
          sessionTitle: 'My session title',
          suppressOriginalPrompt: true,
        },
        { decision: 'block', reason: 'Explanation for decision' },
      ),
    ]);
    expect(outcome.effects.sessionTitle).toBe('My session title');
    expect(outcome.additionalContext).toEqual(['My additional context here']);
  });

  test('judgment: of several hooks the last title wins; an empty one names nothing', () => {
    const outcome = merged('UserPromptSubmit', [
      prompt({ sessionTitle: 'one' }),
      prompt({ sessionTitle: 'two' }),
      prompt({ sessionTitle: '' }),
    ]);
    expect(outcome.effects.sessionTitle).toBe('two');
  });
});

spec('hooks.output.UserPromptSubmit.suppressOriginalPrompt', () => {
  test('true leaves the prompt text out of the block message: the effect is handed on', () => {
    const outcome = merged('UserPromptSubmit', [
      { decision: 'block', reason: 'r', ...prompt({ suppressOriginalPrompt: true }) },
    ]);
    expect(outcome.effects.suppressOriginalPrompt).toBe(true);
    expect(outcome.block).toBeDefined();
  });

  test('false and absent leave it in; one hook that asks is enough', () => {
    expect(
      merged('UserPromptSubmit', [prompt({ suppressOriginalPrompt: false })]).effects
        .suppressOriginalPrompt,
    ).toBeUndefined();
    expect(
      merged('UserPromptSubmit', [prompt({}), prompt({ suppressOriginalPrompt: true })]).effects
        .suppressOriginalPrompt,
    ).toBe(true);
  });

  test('a value that is not a boolean fails validation', () => {
    expect(
      parseHookOutput('UserPromptSubmit', prompt({ suppressOriginalPrompt: 'yes' })).failure,
    ).toContain('suppressOriginalPrompt');
  });
});

describe('UserPromptSubmit cannot replace the prompt', () => {
  test('a rewrite field is dropped: it only injects additionalContext alongside it', () => {
    const outcome = merged('UserPromptSubmit', [
      prompt({ updatedPrompt: 'other', additionalContext: 'ctx' }),
    ]);
    expect(outcome.effects).toEqual({});
    expect(outcome.additionalContext).toEqual(['ctx']);
  });
});

spec('hooks.output.Stop.decision', () => {
  test('block prevents Claude from stopping; omit to allow the stop', () => {
    const outcome = merged('Stop', [
      { decision: 'block', reason: 'Must be provided when Claude is blocked from stopping' },
    ]);
    expect(outcome.block).toMatchObject({ via: 'decision' });
    expect(merged('Stop', [{}]).block).toBeUndefined();
  });

  test('SubagentStop reads the same output', () => {
    expect(merged('SubagentStop', [{ decision: 'block', reason: 'again' }]).block?.reason).toBe(
      'again',
    );
  });

  test('a block with no reason fails validation: "Required when decision is block"', () => {
    for (const event of ['Stop', 'SubagentStop'] as const) {
      expect(parseHookOutput(event, { decision: 'block' }).failure).toContain('reason');
      expect(parseHookOutput(event, { decision: 'block', reason: '' }).failure).toContain('reason');
    }
  });
});

spec('hooks.output.Stop.reason', () => {
  test('tells Claude why it should continue', () => {
    expect(
      merged('Stop', [{ decision: 'block', reason: 'run the tests first' }]).block?.reason,
    ).toBe('run the tests first');
  });
});

spec('hooks.output.Stop.hookSpecificOutput.additionalContext', () => {
  test('is non-error feedback: the conversation continues and nothing is blocked', () => {
    const outcome = merged('Stop', [
      specific('Stop', { additionalContext: 'Please run the test suite before finishing' }),
    ]);
    expect(outcome.additionalContext).toEqual(['Please run the test suite before finishing']);
    expect(outcome.effects.continuesTurn).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  test('without it the turn is not kept going', () => {
    expect(merged('Stop', [{}]).effects.continuesTurn).toBeUndefined();
    expect(
      merged('Stop', [specific('Stop', { additionalContext: '' })]).effects.continuesTurn,
    ).toBeUndefined();
  });

  test('SubagentStop reads it the same way', () => {
    const outcome = merged('SubagentStop', [
      specific('SubagentStop', { additionalContext: 'finish the report' }),
    ]);
    expect(outcome.effects.continuesTurn).toBe(true);
  });
});

spec(['hooks.output.ConfigChange.decision', 'hooks.output.ConfigChange.reason'], () => {
  const block = {
    decision: 'block',
    reason: 'Configuration changes to project settings require admin approval',
  };

  test('block prevents the configuration change from being applied', () => {
    const outcome = merged('ConfigChange', [block], facts('project_settings'));
    expect(outcome.block).toMatchObject({ via: 'decision' });
    expect(merged('ConfigChange', [{}], facts('project_settings')).block).toBeUndefined();
  });

  test("policy_settings changes can't be blocked: the decision is ignored", () => {
    expect(merged('ConfigChange', [block], facts('policy_settings')).block).toBeUndefined();
  });

  test('the reason is "accepted but never shown": a blocked change surfaces no message', async () => {
    const outcome = await viaEngine('ConfigChange', [block], { source: 'user_settings' });
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({ to: 'none', reason: '', message: '' });
    expect(outcome.systemMessages).toEqual([]);
  });

  test('systemMessage and continue are discarded', () => {
    const outcome = merged(
      'ConfigChange',
      [{ systemMessage: 'x', continue: false, ...block }],
      facts('user_settings'),
    );
    expect(outcome.continue).toBe(true);
    expect(outcome.systemMessages).toEqual([]);
  });
});
