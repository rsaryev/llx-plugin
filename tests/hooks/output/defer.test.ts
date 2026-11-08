/**
 * hooks.md § "Defer a tool call for later": `defer` is honored only in `-p` and only for a single
 * tool call, the round trip with `--resume`, what `defer` ignores, and the precedence among hooks.
 * The turn facts are the host's, passed to `resolveDefer`.
 */
import { expect, test } from 'bun:test';
import { preToolUseHookOutcome, resolveDefer } from '../../../src/hooks/index.ts';
import type { CommandResult } from '../../../src/ports/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { ask, allow, decision } from '../../support/decide.ts';
import { fire } from '../../support/hooks-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { command, entry, FACTS } from '../../support/hooks-select.ts';
import { spec } from '../../support/spec.ts';

/** A hook's own JSON as a script prints it. */
const prints = (body: object): Partial<CommandResult> => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
});

const hookNamed = (event: HookEvent, name: string) =>
  entry(event, { handler: command(`./${name}.sh`) });

spec('hooks.behavior.Defer a tool call for later', () => {
  const defer = specific('PreToolUse', { permissionDecision: 'defer' });
  const AskQuestion = {
    ...FACTS.PreToolUse,
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [] },
  };

  test('a defer holds the turn: the outcome carries it with the condition the host applies', async () => {
    const outcome = await viaEngine('PreToolUse', [defer], AskQuestion);
    expect(outcome.effects.permissionDecision).toBe('defer');
    expect(outcome.effects.deferCondition).toBe('non-interactive-single-tool-call');
  });

  test('honored only in -p, and only when Claude makes a single tool call in the turn', async () => {
    const outcome = await viaEngine('PreToolUse', [defer], AskQuestion);
    expect(resolveDefer(outcome.effects, { interactive: false, toolCalls: 1 })).toEqual({
      kind: 'deferred',
    });
  });

  test('in an interactive session it logs a warning and ignores the hook result', async () => {
    const outcome = await viaEngine('PreToolUse', [defer], AskQuestion);
    const resolved = resolveDefer(outcome.effects, { interactive: true, toolCalls: 1 });
    expect(resolved).toMatchObject({ kind: 'ignored', warning: { severity: 'warning' } });
  });

  test('with several tool calls at once it is ignored with a warning, and the tool goes through the normal permission flow', async () => {
    const outcome = await viaEngine('PreToolUse', [defer], {
      ...FACTS.PreToolUse,
      tool_name: 'Bash',
    });
    const resolved = resolveDefer(outcome.effects, { interactive: false, toolCalls: 2 });
    expect(resolved).toMatchObject({ kind: 'ignored', warning: { severity: 'warning' } });
    expect(
      decision(
        'default',
        'Bash',
        { command: 'npm test' },
        { hook: preToolUseHookOutcome(outcome) },
      ),
    ).toEqual(ask('default-prompt'));
  });

  test('a decision that is not defer has nothing to resolve', async () => {
    for (const permissionDecision of ['allow', 'deny', 'ask'] as const) {
      const outcome = await viaEngine('PreToolUse', [
        specific('PreToolUse', { permissionDecision }),
      ]);
      expect(resolveDefer(outcome.effects, { interactive: false, toolCalls: 1 })).toEqual({
        kind: 'none',
      });
    }
    expect(resolveDefer({}, { interactive: false, toolCalls: 1 })).toEqual({ kind: 'none' });
  });

  test('the round trip: the resumed call fires PreToolUse again, and the hook defers until the answer is ready, then allows with it', async () => {
    const waiting = await viaEngine('PreToolUse', [defer], AskQuestion);
    expect(waiting.effects.permissionDecision).toBe('defer');
    const answer = { questions: [], answers: { 'Which framework?': 'React' } };
    const ready = await viaEngine(
      'PreToolUse',
      [specific('PreToolUse', { permissionDecision: 'allow', updatedInput: answer })],
      AskQuestion,
    );
    expect(ready.effects.permissionDecision).toBe('allow');
    expect(ready.effects.updatedInput).toEqual(answer);
    expect(
      decision(
        'default',
        'AskUserQuestion',
        { questions: [] },
        { hook: preToolUseHookOutcome(ready) },
      ),
    ).toEqual(allow('hook'));
  });

  test('updatedInput is ignored for defer, and the reason goes to the debug log only', async () => {
    const outcome = await viaEngine('PreToolUse', [
      specific('PreToolUse', {
        permissionDecision: 'defer',
        permissionDecisionReason: 'waiting for the UI',
        updatedInput: { command: 'ls' },
      }),
    ]);
    expect(outcome.effects.updatedInput).toBeUndefined();
    expect(outcome.proceed).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  test('precedence among hooks is deny > defer > ask > allow', async () => {
    const decisions = ['allow', 'ask', 'defer', 'deny'] as const;
    const hooks = decisions.map((_d, index) => hookNamed('PreToolUse', `h${index}`));
    const run = async (...order: readonly (typeof decisions)[number][]) => {
      const { outcome } = await fire(
        'PreToolUse',
        hooks.slice(0, order.length),
        order.map((permissionDecision) => prints(specific('PreToolUse', { permissionDecision }))),
        { output: stage },
      );
      return outcome.effects.permissionDecision;
    };
    expect(await run('allow', 'ask', 'defer', 'deny')).toBe('deny');
    expect(await run('allow', 'ask', 'defer')).toBe('defer');
    expect(await run('allow', 'ask')).toBe('ask');
    expect(await run('allow', 'allow')).toBe('allow');
    expect(await run('deny', 'defer')).toBe('deny');
  });
});
