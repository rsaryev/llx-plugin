/**
 * `toSdkHookOutput` (agent-sdk/hooks.md, "Outputs": top-level `systemMessage` and `continue`, and
 * `hookSpecificOutput` per event): a merged outcome written as one SDK callback's answer. The SDK
 * pages carry no requirement ids, and joining several hooks' texts is the kit's choice
 * (spec/judgments.md), so this is tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { HookOutcome } from '../../src/hooks/index.ts';
import type { HookEvent } from '../../src/protocol/official.ts';
import { toSdkHookOutput } from '../../src/host/sdk-output.ts';

const outcomeOf = <E extends HookEvent>(
  event: E,
  fields: Partial<HookOutcome<E>> = {},
): HookOutcome<E> => ({
  event,
  proceed: true,
  continue: true,
  systemMessages: [],
  additionalContext: [],
  effects: {},
  terminalSequences: [],
  notices: [],
  feedback: [],
  stdout: [],
  runs: [],
  consumedOnce: [],
  background: [],
  issues: [],
  ...fields,
});

describe('toSdkHookOutput', () => {
  test('an outcome with nothing to say is an empty answer', () => {
    expect(toSdkHookOutput(outcomeOf('SessionEnd'))).toEqual({});
  });

  test("several hooks' context and messages are joined with a newline", () => {
    const output = toSdkHookOutput(
      outcomeOf('PostToolUse', {
        additionalContext: ['first', 'second'],
        systemMessages: ['a', 'b'],
      }),
    );
    expect(output).toEqual({
      systemMessage: 'a\nb',
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'first\nsecond' },
    });
  });

  test('a hook that stops the session is continue false with its reason', () => {
    const output = toSdkHookOutput(outcomeOf('Stop', { continue: false, stopReason: 'done' }));
    expect(output).toMatchObject({ continue: false, stopReason: 'done' });
  });

  test('a block by continue false is no decision', () => {
    const output = toSdkHookOutput(
      outcomeOf('PreToolUse', {
        proceed: false,
        continue: false,
        block: { via: 'continue-false', to: 'user', reason: 'halt', message: 'm', by: 'p' },
      }),
    );
    expect(output).toEqual({
      continue: false,
      hookSpecificOutput: { hookEventName: 'PreToolUse' },
    });
  });

  test('SessionStart carries its watch paths and title', () => {
    const output = toSdkHookOutput(
      outcomeOf('SessionStart', { effects: { watchPaths: ['/a'], sessionTitle: 'T' } }),
    );
    expect(output.hookSpecificOutput).toEqual({
      hookEventName: 'SessionStart',
      watchPaths: ['/a'],
      sessionTitle: 'T',
    });
  });

  test('a PermissionRequest block is a deny decision with the reason as message', () => {
    const output = toSdkHookOutput(
      outcomeOf('PermissionRequest', {
        proceed: false,
        block: { via: 'exit2', to: 'claude', reason: 'no', message: 'm', by: 'p' },
      }),
    );
    expect(output.hookSpecificOutput).toEqual({
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'no' },
    });
  });

  test('PreModelSwitch drops a defer, which it does not take', () => {
    const output = toSdkHookOutput(
      outcomeOf('PreModelSwitch', { effects: { permissionDecision: 'defer' } }),
    );
    expect(output.hookSpecificOutput).toEqual({ hookEventName: 'PreModelSwitch' });
  });

  test('WorktreeCreate answers with the path a command hook printed last', () => {
    const output = toSdkHookOutput(outcomeOf('WorktreeCreate', { stdout: ['log\n/w/tree\n'] }));
    expect(output.hookSpecificOutput).toEqual({
      hookEventName: 'WorktreeCreate',
      worktreePath: '/w/tree',
    });
  });
});
