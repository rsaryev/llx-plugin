/**
 * hooks.md § "Add context for Claude" (external data) and § "Tools that require user interaction":
 * data fetched by an HTTP or command hook reaches Claude; `AskUserQuestion` and `ExitPlanMode` need
 * `updatedInput` paired with `allow`, and an MCP tool marked `requiresUserInteraction` is stricter.
 * The permission check is the real `decide`, fed the hook outcome through `preToolUseHookOutcome`.
 */
import { expect, test } from 'bun:test';
import { createOutputStage, preToolUseHookOutcome } from '../../../src/hooks/index.ts';
import { ask, allow, decision } from '../../support/decide.ts';
import { fire } from '../../support/hooks-fire.ts';
import { prints } from '../../support/hooks-script.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { entry, FACTS } from '../../support/hooks-select.ts';
import { memoryScratch, type RunnerReply } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { recordOf, stdinJson } from '../../support/stdin.ts';

/** The docs' kind of script: reads the questions from stdin and answers each with its first option. */
const pickFirstOptions: RunnerReply = (run) => {
  const toolInput = recordOf(stdinJson(run)['tool_input']);
  const questions = Array.isArray(toolInput['questions']) ? toolInput['questions'] : [];
  const picked = Object.fromEntries(
    questions.map((item) => {
      const question = recordOf(item);
      const options = Array.isArray(question['options']) ? question['options'] : [];
      return [String(question['question']), String(recordOf(options[0])['label'])];
    }),
  );
  return prints(
    specific('PreToolUse', {
      permissionDecision: 'allow',
      updatedInput: { questions, answers: picked },
    }),
  );
};

spec('hooks.behavior.Add context for Claude.External data', () => {
  const issues = 'Open issues assigned to you: #12 Login fails, #15 Slow search';

  test('content fetched from an internal service by an HTTP hook reaches Claude', async () => {
    const body = JSON.stringify(specific('UserPromptSubmit', { additionalContext: issues }));
    const { outcome } = await fire(
      'UserPromptSubmit',
      [
        entry('UserPromptSubmit', {
          handler: { type: 'http', url: 'http://issues.internal/open' },
        }),
      ],
      [],
      { output: stage, http: [{ status: 200, body }] },
    );
    expect(outcome.additionalContext).toEqual([issues]);
  });

  test('a command hook that prints the data as plain text adds it on UserPromptSubmit', async () => {
    const { outcome } = await fire(
      'UserPromptSubmit',
      [entry('UserPromptSubmit')],
      [{ stdout: 'Recent CI: build 4821 passed' }],
      { output: stage },
    );
    expect(outcome.additionalContext).toEqual(['Recent CI: build 4821 passed']);
  });

  test('plain text from an HTTP hook is a non-blocking error and adds no context', async () => {
    const { outcome } = await fire(
      'UserPromptSubmit',
      [
        entry('UserPromptSubmit', {
          handler: { type: 'http', url: 'http://issues.internal/open' },
        }),
      ],
      [],
      { output: stage, http: [{ status: 200, body: 'Open issues: #12' }] },
    );
    expect(outcome.additionalContext).toEqual([]);
    expect(outcome.proceed).toBe(true);
  });

  test('fetched data over the cap is saved to a file and Claude is given the path and a preview', async () => {
    const scratch = memoryScratch('/session');
    const data = `issue-list ${'.'.repeat(11_000)}`;
    const { outcome } = await fire(
      'UserPromptSubmit',
      [entry('UserPromptSubmit')],
      [prints(specific('UserPromptSubmit', { additionalContext: data }))],
      { output: createOutputStage({ scratch }) },
    );
    expect(scratch.files.size).toBe(1);
    expect(outcome.additionalContext[0]).toContain(data.slice(0, 2_000));
    expect(outcome.additionalContext[0]?.length).toBeLessThan(data.length);
  });
});

spec('hooks.behavior.Tools that require user interaction', () => {
  const QUESTIONS = [
    {
      question: 'Which framework?',
      header: 'Framework',
      options: [
        { label: 'React', description: 'Component library' },
        { label: 'Vue', description: 'Progressive framework' },
      ],
      multiSelect: false,
    },
  ];
  const ask1 = {
    ...FACTS.PreToolUse,
    tool_name: 'AskUserQuestion',
    tool_input: { questions: QUESTIONS },
  };
  /** The docs' output: allow, with the questions echoed and the answer added. */
  const answered = specific('PreToolUse', {
    permissionDecision: 'allow',
    updatedInput: { questions: QUESTIONS, answers: { 'Which framework?': 'React' } },
  });

  test('the docs example is read as allow with updatedInput that holds the answer', async () => {
    const outcome = await viaEngine('PreToolUse', [answered], ask1);
    expect(outcome.effects.permissionDecision).toBe('allow');
    expect(outcome.effects.updatedInput).toEqual({
      questions: QUESTIONS,
      answers: { 'Which framework?': 'React' },
    });
  });

  test('a script reads the tool input from stdin, collects the answer, and returns it with allow', async () => {
    const { outcome } = await fire(
      'PreToolUse',
      [entry('PreToolUse', { matcher: 'AskUserQuestion' })],
      [pickFirstOptions],
      {
        output: stage,
        facts: ask1,
      },
    );
    expect(outcome.effects.updatedInput).toMatchObject({
      answers: { 'Which framework?': 'React' },
    });
  });

  test.each(['default', 'acceptEdits', 'plan', 'bypassPermissions'] as const)(
    'in %s mode, allow alone is not sufficient: the tool still asks, and allow with updatedInput lets it run',
    async (mode) => {
      const bare = await viaEngine(
        'PreToolUse',
        [specific('PreToolUse', { permissionDecision: 'allow' })],
        ask1,
      );
      expect(
        decision(
          mode,
          'AskUserQuestion',
          { questions: QUESTIONS },
          { hook: preToolUseHookOutcome(bare) },
        ),
      ).toEqual(ask('requires-user-interaction'));
      const paired = await viaEngine('PreToolUse', [answered], ask1);
      expect(
        decision(
          mode,
          'AskUserQuestion',
          { questions: QUESTIONS },
          { hook: preToolUseHookOutcome(paired) },
        ),
      ).toEqual(allow('hook'));
    },
  );

  test('ExitPlanMode needs the same pairing', async () => {
    const plan = {
      plan: '## Refactor auth\n1. Extract...',
      planFilePath: '/p/plans/refactor-auth.md',
    };
    const facts = { ...FACTS.PreToolUse, tool_name: 'ExitPlanMode', tool_input: plan };
    const bare = await viaEngine(
      'PreToolUse',
      [specific('PreToolUse', { permissionDecision: 'allow' })],
      facts,
    );
    for (const mode of ['default', 'plan'] as const) {
      expect(
        decision(mode, 'ExitPlanMode', plan, { hook: preToolUseHookOutcome(bare) }),
      ).toMatchObject({
        outcome: 'ask',
      });
    }
    const paired = await viaEngine(
      'PreToolUse',
      [specific('PreToolUse', { permissionDecision: 'allow', updatedInput: plan })],
      facts,
    );
    expect(decision('plan', 'ExitPlanMode', plan, { hook: preToolUseHookOutcome(paired) })).toEqual(
      allow('hook'),
    );
  });

  test('updatedInput without allow does not approve it either', async () => {
    const outcome = await viaEngine(
      'PreToolUse',
      [specific('PreToolUse', { updatedInput: { questions: QUESTIONS, answers: {} } })],
      ask1,
    );
    expect(
      decision(
        'default',
        'AskUserQuestion',
        { questions: QUESTIONS },
        { hook: preToolUseHookOutcome(outcome) },
      ),
    ).toEqual(ask('requires-user-interaction'));
  });

  test('an MCP tool its server marks requiresUserInteraction is stricter: allow cannot skip the prompt, with or without updatedInput', async () => {
    const tool = 'mcp__forms__confirm';
    const marked = { requiresUserInteraction: new Set([tool]) };
    for (const fields of [
      { permissionDecision: 'allow' },
      { permissionDecision: 'allow', updatedInput: { ok: true } },
    ]) {
      const outcome = await viaEngine('PreToolUse', [specific('PreToolUse', fields)], {
        ...FACTS.PreToolUse,
        tool_name: tool,
      });
      expect(
        decision('default', tool, {}, { ...marked, hook: preToolUseHookOutcome(outcome) }),
      ).toEqual(ask('requires-user-interaction'));
    }
  });
});
