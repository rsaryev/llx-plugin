/**
 * hooks.md § "PreToolUse decision control" ("A hook that blocks by exiting 2 routes the same way as
 * `"deny"`") and § "Defer a tool call for later": what `preToolUseHookOutcome` hands the permission
 * check, and what the real `decide` makes of it.
 */
import { expect, test } from 'bun:test';
import { preToolUseHookOutcome } from '../../../src/hooks/index.ts';
import { deny, decision } from '../../support/decide.ts';
import { exits } from '../../support/hooks-script.ts';
import { specific, viaEngine } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

const LS = { command: 'ls' };

spec('hooks.exit2.PreToolUse', () => {
  test('an exit-2 hook is a deny that blocked: decide denies the call whatever the mode', async () => {
    const outcome = await exits('PreToolUse', 2, 'Database writes are not allowed');
    expect(preToolUseHookOutcome(outcome)).toEqual({ decision: 'deny', blocked: true });
    for (const mode of ['default', 'acceptEdits', 'bypassPermissions'] as const) {
      expect(decision(mode, 'Bash', LS, { hook: preToolUseHookOutcome(outcome) })).toEqual(
        deny('hook'),
      );
    }
  });

  test('a deny printed as JSON is the same decision without the blocked mark', async () => {
    const outcome = await viaEngine('PreToolUse', [
      specific('PreToolUse', { permissionDecision: 'deny' }),
    ]);
    expect(preToolUseHookOutcome(outcome)).toEqual({ decision: 'deny' });
  });
});

spec('hooks.behavior.Defer a tool call for later', () => {
  test('a defer reaches the permission check as the decision defer, not as a block', async () => {
    const outcome = await viaEngine('PreToolUse', [
      specific('PreToolUse', { permissionDecision: 'defer' }),
    ]);
    expect(preToolUseHookOutcome(outcome)).toEqual({ decision: 'defer' });
  });
});
