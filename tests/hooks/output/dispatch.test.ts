/**
 * The output stage inside a dispatch: hooks.md § "JSON output", § "Exit code 0", § "Exit code 2" and
 * § "Decision control", through the real engine with the real output stage (the verdict tests use
 * a stand-in). The engine's default stage is the real one.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { createHookEngine, createHookRegistry } from '../../../src/hooks/index.ts';
import { cmd, fire } from '../../support/hooks-fire.ts';
import { specific, stage, viaEngine } from '../../support/hooks-output.ts';
import { command, entry, FACTS, session } from '../../support/hooks-select.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../support/ports.ts';

const hookN = (event: Parameters<typeof entry>[0], index: number) =>
  entry(event, { handler: command(`./hook-${index}.sh`) });

spec(
  [
    'hooks.behavior.Decision control',
    'hooks.guide.Structured JSON output',
    'hooks.guide.Combine results from multiple hooks',
  ],
  () => {
    test('PreToolUse permissionDecision deny: the call is held back and Claude is told the reason', async () => {
      const outcome = await viaEngine('PreToolUse', [
        specific('PreToolUse', {
          permissionDecision: 'deny',
          permissionDecisionReason: 'Database writes are not allowed',
        }),
      ]);
      expect(outcome.proceed).toBe(false);
      expect(outcome.effects.permissionDecision).toBe('deny');
      expect(outcome.block).toMatchObject({
        via: 'decision',
        to: 'claude',
        reason: 'Database writes are not allowed',
      });
    });

    test("exit 2 with a JSON deny: the decision's reason replaces the stderr", async () => {
      const hook = entry('PreToolUse', { handler: cmd() });
      const stdout = JSON.stringify(
        specific('PreToolUse', {
          permissionDecision: 'deny',
          permissionDecisionReason: 'Policy says no',
        }),
      );
      const { outcome } = await fire(
        'PreToolUse',
        [hook],
        [{ exitCode: 2, stderr: 'raw stderr', stdout }],
        { output: stage },
      );
      expect(outcome.block).toMatchObject({ via: 'exit2', reason: 'Policy says no' });
    });

    test('an exit-2 hook beats the allow of another: the effects say deny', async () => {
      const hooks = [hookN('PreToolUse', 0), hookN('PreToolUse', 1)];
      const allow = JSON.stringify(
        specific('PreToolUse', { permissionDecision: 'allow', updatedInput: { command: 'ls' } }),
      );
      const { outcome } = await fire(
        'PreToolUse',
        hooks,
        [
          { exitCode: 0, stdout: allow },
          { exitCode: 2, stderr: 'no rm' },
        ],
        {
          output: stage,
        },
      );
      expect(outcome.proceed).toBe(false);
      expect(outcome.effects).toEqual({
        permissionDecision: 'deny',
        permissionDecisionReason: 'no rm',
      });
    });

    test('PermissionRequest allow with updatedInput and updatedPermissions', async () => {
      const decision = {
        behavior: 'allow',
        updatedInput: { command: 'npm run lint' },
        updatedPermissions: [{ type: 'setMode', mode: 'manual', destination: 'session' }],
      };
      const outcome = await viaEngine('PermissionRequest', [
        specific('PermissionRequest', { decision }),
      ]);
      expect(outcome.effects.permissionRequest).toEqual({
        behavior: 'allow',
        updatedInput: { command: 'npm run lint' },
        updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }],
      });
    });

    test('a PermissionRequest hook that fails with onFailure block denies, with its text as the message', async () => {
      const hook = entry('PermissionRequest', { handler: cmd({ onFailure: 'block' }) });
      const { outcome } = await fire(
        'PermissionRequest',
        [hook],
        [{ exitCode: 1, stderr: 'crashed' }],
        { output: stage },
      );
      expect(outcome.effects.permissionRequest).toMatchObject({ behavior: 'deny' });
      expect(outcome.proceed).toBe(false);
    });
  },
);

spec(['hooks.guide.Hook output', 'hooks.guide.Combine results from multiple hooks'], () => {
  test('context, system messages and terminal sequences of several hooks, in registry order', async () => {
    const outcome = await viaEngine('PostToolUse', [
      {
        systemMessage: 'one',
        terminalSequence: '\u0007',
        ...specific('PostToolUse', { additionalContext: 'ctx 1' }),
      },
      { systemMessage: 'two', ...specific('PostToolUse', { additionalContext: 'ctx 2' }) },
    ]);
    expect(outcome.systemMessages).toEqual(['one', 'two']);
    expect(outcome.additionalContext).toEqual(['ctx 1', 'ctx 2']);
    expect(outcome.terminalSequences).toEqual(['\u0007']);
  });

  test('a terminal sequence off the allowlist is dropped and reported in the outcome', async () => {
    const outcome = await viaEngine('Notification', [{ terminalSequence: '\u001b[2J' }]);
    expect(outcome.terminalSequences).toEqual([]);
    expect(outcome.issues.some((issue) => issue.message.includes('allowlist'))).toBe(true);
  });

  test('continue: false stops, with its reason', async () => {
    const outcome = await viaEngine('PostToolUse', [
      { continue: false, stopReason: 'Build failed' },
    ]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Build failed');
  });

  test('plain stdout of a UserPromptSubmit hook is context', async () => {
    const outcome = await viaEngine('UserPromptSubmit', ['today is Friday']);
    expect(outcome.additionalContext).toEqual(['today is Friday']);
  });

  test('PreCompact stdout becomes compaction instructions', async () => {
    const outcome = await viaEngine('PreCompact', ['Keep the API decisions']);
    expect(outcome.effects.compactionInstructions).toEqual(['Keep the API decisions']);
  });

  test("a PostToolUse rewrite is checked against the tool of the event's facts", async () => {
    const good = { stdout: 'ok', stderr: '', interrupted: false };
    const facts = { ...FACTS.PostToolUse, tool_name: 'Bash' };
    const ok = await viaEngine(
      'PostToolUse',
      [specific('PostToolUse', { updatedToolOutput: good })],
      facts,
    );
    expect(ok.effects.updatedToolOutput).toEqual(good);
    const wrong = await viaEngine(
      'PostToolUse',
      [specific('PostToolUse', { updatedToolOutput: 'text' })],
      facts,
    );
    expect(wrong.effects.updatedToolOutput).toBeUndefined();
    expect(wrong.issues.some((issue) => issue.message.includes('Bash output shape'))).toBe(true);
  });
});

spec('hooks.guide.Shell profile output before the JSON', () => {
  test('output that does not start with { is plain text: the JSON in it is ignored, with no error', async () => {
    const stdout = 'Shell ready on arm64\n{"decision": "block", "reason": "Not allowed"}';
    const hook = entry('Stop', { handler: cmd() });
    const { outcome } = await fire('Stop', [hook], [{ exitCode: 0, stdout }], { output: stage });
    expect(outcome.block).toBeUndefined();
    expect(outcome.proceed).toBe(true);
    expect(outcome.runs[0]?.status).not.toBe('blocking-error');
  });

  test('the same JSON alone is read', async () => {
    const stdout = '{"decision": "block", "reason": "Not allowed"}';
    const hook = entry('Stop', { handler: cmd() });
    const { outcome } = await fire('Stop', [hook], [{ exitCode: 0, stdout }], { output: stage });
    expect(outcome.block).toMatchObject({ reason: 'Not allowed' });
  });
});

describe('output that fails validation', () => {
  test('is a non-blocking error whose notice carries the validation message', async () => {
    const outcome = await viaEngine('PreToolUse', [{ continue: 'sure' }]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.runs[0]?.status).toBe('non-blocking-error');
    expect(outcome.notices[0]?.message).toContain('continue');
  });
});

describe("the engine's default output stage", () => {
  test('is the real one: no options needed', async () => {
    const hook = entry('PreToolUse');
    const stdout = JSON.stringify(
      specific('PreToolUse', { permissionDecision: 'ask', permissionDecisionReason: 'sure?' }),
    );
    const engine = createHookEngine({
      commands: scriptedRunner({ exitCode: 0, stdout }),
      locations: locations(),
      environment: fakeEnvironment(),
    });
    const outcome = await engine.dispatch(createHookRegistry([hook]), {
      event: 'PreToolUse',
      facts: FACTS.PreToolUse,
      session: session(),
      signal: new AbortController().signal,
    });
    expect(outcome.effects).toEqual({
      permissionDecision: 'ask',
      permissionDecisionReason: 'sure?',
    });
  });
});
