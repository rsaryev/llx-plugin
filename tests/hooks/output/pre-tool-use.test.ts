/**
 * hooks.md § "PreToolUse decision control" (the field table, "precedence is deny > defer > ask >
 * allow", the deprecated `approve`/`block`), § "Defer a tool call for later", § "Match Monitor
 * commands" and § "Add context for Claude". That Claude Code skips a prompt, shows a reason or
 * runs the rewritten call is the host's; what is proven here is the decision, reason, input and
 * context the merge hands it, through the real parse, cap and merge.
 */
import { describe, expect, test } from 'bun:test';
import { parseHookOutput } from '../../../src/hooks/index.ts';
import { HOOK_EVENTS, type HookSpecificOutputOf } from '../../../src/protocol/hook-events.ts';
import { merged, specific, viaEngine } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const pre = (fields: object, top: object = {}) => ({ ...top, ...specific('PreToolUse', fields) });
type Decision = NonNullable<HookSpecificOutputOf<'PreToolUse'>['permissionDecision']>;
const decide = (permissionDecision: string, more: object = {}) =>
  pre({ permissionDecision, ...more });

spec('hooks.output.PreToolUse.permissionDecision', () => {
  test('the documented deny: the call is held back and Claude is given the reason', async () => {
    const outcome = await viaEngine('PreToolUse', [
      decide('deny', { permissionDecisionReason: 'Database writes are not allowed' }),
    ]);
    expect(outcome.effects.permissionDecision).toBe('deny');
    expect(outcome.block).toMatchObject({
      via: 'decision',
      to: 'claude',
      reason: 'Database writes are not allowed',
    });
  });

  test.each(['allow', 'ask', 'defer'])(
    '%s is handed on and does not hold the call back',
    (decision) => {
      const outcome = merged('PreToolUse', [decide(decision)]);
      expect(outcome.effects.permissionDecision).toBe(decision);
      expect(outcome.block).toBeUndefined();
    },
  );

  test('no decision is no effect', () => {
    expect(merged('PreToolUse', [pre({})]).effects).toEqual({});
    expect(merged('PreToolUse', []).effects).toEqual({});
  });

  const PRECEDENCE: readonly (readonly [readonly Decision[], Decision])[] = [
    [['allow', 'ask'], 'ask'],
    [['allow', 'defer'], 'defer'],
    [['ask', 'defer'], 'defer'],
    [['allow', 'deny'], 'deny'],
    [['ask', 'deny'], 'deny'],
    [['defer', 'deny'], 'deny'],
    [['deny', 'allow', 'ask', 'defer'], 'deny'],
    [['allow', 'allow'], 'allow'],
  ];
  test.each(PRECEDENCE)(
    'hooks that return %j: precedence is deny > defer > ask > allow, so %s',
    (given, expected) => {
      const outcome = merged(
        'PreToolUse',
        given.map((decision) => decide(decision)),
      );
      expect(outcome.effects.permissionDecision).toBe(expected);
      // The precedence does not depend on the order the hooks are registered in.
      const reversed = merged(
        'PreToolUse',
        [...given].toReversed().map((decision) => decide(decision)),
      );
      expect(reversed.effects.permissionDecision).toBe(expected);
    },
  );

  test('a deny of one hook holds the call back whatever the others allow', () => {
    const outcome = merged('PreToolUse', [
      decide('allow'),
      decide('deny', { permissionDecisionReason: 'no' }),
    ]);
    expect(outcome.block).toMatchObject({ reason: 'no' });
  });

  test('the deprecated top-level decision maps approve to allow and block to deny, with its reason', () => {
    expect(merged('PreToolUse', [{ decision: 'approve' }]).effects.permissionDecision).toBe(
      'allow',
    );
    const blocked = merged('PreToolUse', [{ decision: 'block', reason: 'old style' }]);
    expect(blocked.effects).toMatchObject({
      permissionDecision: 'deny',
      permissionDecisionReason: 'old style',
    });
    expect(blocked.block).toMatchObject({ reason: 'old style' });
  });

  test('approve is a PreToolUse value only: every other event fails validation on it', () => {
    for (const event of HOOK_EVENTS) {
      const failure = parseHookOutput(event, { decision: 'approve' }).failure;
      if (event === 'PreToolUse') expect(failure).toBeUndefined();
      else expect(failure).toContain('decision');
    }
  });

  test('hookSpecificOutput wins over the deprecated fields of the same hook', () => {
    const outcome = merged('PreToolUse', [
      { decision: 'block', ...specific('PreToolUse', { permissionDecision: 'allow' }) },
    ]);
    expect(outcome.effects.permissionDecision).toBe('allow');
  });

  test('a defer is the merged decision, an ask is not one', () => {
    expect(merged('PreToolUse', [decide('defer')]).effects.permissionDecision).toBe('defer');
    expect(merged('PreToolUse', [decide('ask')]).effects.permissionDecision).toBe('ask');
  });

  test('a decision outside allow, deny, ask and defer fails validation', () => {
    expect(parseHookOutput('PreToolUse', decide('maybe')).failure).toContain('permissionDecision');
  });
});

describe('Monitor under a Bash matcher', () => {
  test("a hook's allow and updatedInput are not applied, its deny is", () => {
    const allow = decide('allow', { updatedInput: { command: 'x' } });
    expect(merged('PreToolUse', [{ json: allow, ignored: true }]).effects).toEqual({});
    expect(
      merged('PreToolUse', [{ json: decide('deny'), ignored: true }]).effects.permissionDecision,
    ).toBe('deny');
  });
});

spec('hooks.output.PreToolUse.permissionDecisionReason', () => {
  test('for deny it is the reason Claude is shown', () => {
    const outcome = merged('PreToolUse', [
      decide('deny', { permissionDecisionReason: 'use the staging DB' }),
    ]);
    expect(outcome.block?.reason).toBe('use the staging DB');
    expect(outcome.effects.permissionDecisionReason).toBe('use the staging DB');
  });

  test.each(['ask', 'allow', 'defer'])(
    'for %s it is handed on for the prompt or the debug log, and blocks nothing',
    (decision) => {
      const outcome = merged('PreToolUse', [
        decide(decision, { permissionDecisionReason: 'because' }),
      ]);
      expect(outcome.effects.permissionDecisionReason).toBe('because');
      expect(outcome.block).toBeUndefined();
    },
  );

  test("the reason is the winning hook's", () => {
    const outcome = merged('PreToolUse', [
      decide('ask', { permissionDecisionReason: 'confirm?' }),
      decide('deny', { permissionDecisionReason: 'denied' }),
    ]);
    expect(outcome.effects.permissionDecisionReason).toBe('denied');
  });

  test('a reason of the wrong type fails validation', () => {
    expect(parseHookOutput('PreToolUse', pre({ permissionDecisionReason: 1 })).failure).toContain(
      'permissionDecisionReason',
    );
  });
});

spec('hooks.output.PreToolUse.updatedInput', () => {
  const original = { command: 'npm test', timeout: 5000 };

  test('replaces the whole input object: only what the hook returns is there', () => {
    const outcome = merged('PreToolUse', [
      decide('allow', { updatedInput: { command: 'npm run lint' } }),
    ]);
    expect(outcome.effects.updatedInput).toEqual({ command: 'npm run lint' });
    expect(outcome.effects.updatedInput).not.toMatchObject(original);
  });

  test('works with ask, and with no decision at all', () => {
    expect(
      merged('PreToolUse', [decide('ask', { updatedInput: { a: 1 } })]).effects.updatedInput,
    ).toEqual({ a: 1 });
    expect(merged('PreToolUse', [pre({ updatedInput: { a: 1 } })]).effects.updatedInput).toEqual({
      a: 1,
    });
  });

  test('a deny holds the call back, so no hook rewrites it, as for an exit-2 deny', () => {
    const outcome = merged('PreToolUse', [
      decide('deny', { permissionDecisionReason: 'no' }),
      decide('allow', { updatedInput: { a: 1 } }),
    ]);
    expect(outcome.effects.permissionDecision).toBe('deny');
    expect(outcome.effects.updatedInput).toBeUndefined();
    expect(outcome.block).toMatchObject({ reason: 'no' });
  });

  test('for defer it is ignored', () => {
    expect(
      merged('PreToolUse', [decide('defer', { updatedInput: { a: 1 } })]).effects.updatedInput,
    ).toBeUndefined();
  });

  test('the AskUserQuestion answer: allow with the questions and the answers', () => {
    const updatedInput = {
      questions: [
        { question: 'Which framework?', header: 'Framework', options: [], multiSelect: false },
      ],
      answers: { 'Which framework?': 'React' },
    };
    const outcome = merged('PreToolUse', [decide('allow', { updatedInput })]);
    expect(outcome.effects).toMatchObject({ permissionDecision: 'allow', updatedInput });
  });

  test('judgment: of several hooks that rewrite the input, the last in registry order wins', () => {
    const outcome = merged('PreToolUse', [
      decide('allow', { updatedInput: { n: 1 } }),
      decide('allow', { updatedInput: { n: 2 } }),
      decide('allow'),
    ]);
    expect(outcome.effects.updatedInput).toEqual({ n: 2 });
  });

  test('a value that is not an object fails validation', () => {
    for (const bad of ['npm test', ['a'], 3]) {
      expect(parseHookOutput('PreToolUse', pre({ updatedInput: bad })).failure).toContain(
        'updatedInput',
      );
    }
  });
});

spec('hooks.output.PreToolUse.additionalContext', () => {
  test('is added alongside the tool result, from every hook that returns one', () => {
    const outcome = merged('PreToolUse', [
      pre({ additionalContext: 'Current environment: production.' }),
      pre({}),
      pre({ additionalContext: 'Second hook' }),
    ]);
    expect(outcome.additionalContext).toEqual(['Current environment: production.', 'Second hook']);
  });

  test("is ignored when that hook's permissionDecision is defer", () => {
    const outcome = merged('PreToolUse', [
      decide('defer', { additionalContext: 'dropped' }),
      decide('allow', { additionalContext: 'kept' }),
    ]);
    expect(outcome.additionalContext).toEqual(['kept']);
  });

  test('a <system-reminder> tag in it has its < replaced by &lt;', () => {
    const outcome = merged('PreToolUse', [
      pre({ additionalContext: 'a <system-reminder>b</system-reminder> c' }),
    ]);
    expect(outcome.additionalContext).toEqual(['a &lt;system-reminder>b&lt;/system-reminder> c']);
  });
});

// Judgment (spec/judgments.md): "For `"defer"`, ignored" is read of the decision the hooks come to,
// so a deferred call carries no other hook's rewrite either; the call resumes with the input
// `deferred_tool_use` reports.
test('a defer that wins over an allow leaves the allow hook’s updatedInput out', () => {
  const outcome = merged('PreToolUse', [
    decide('allow', { updatedInput: { a: 1 } }),
    decide('defer'),
  ]);
  expect(outcome.effects.permissionDecision).toBe('defer');
  expect(outcome.effects.updatedInput).toBeUndefined();
});
