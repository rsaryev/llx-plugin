/**
 * Judgment (spec/judgments.md, `src/hooks/select/if-guard.ts`): what `evaluateIf` finds wrong with a
 * hook's `if` (hooks.md, "Common fields": "The `if` field holds exactly one permission rule") reaches
 * the host in the dispatch outcome, `HookOutcome.issues`, at `<handler path>.if`, whether the handler
 * then runs or not.
 */
import { describe, expect, test } from 'bun:test';
import { entry } from '../support/hooks-select.ts';
import { engineSession } from '../support/hooks-session.ts';

const withIf = (rule: string) =>
  entry('PreToolUse', {
    matcher: 'Bash',
    handler: { type: 'command', command: './c.sh', if: rule },
  });

describe('judgments: the issues of an `if` are in the dispatch outcome', () => {
  test('a rule that does not parse runs the handler, and its issue is in the outcome', async () => {
    const { fire, runner } = engineSession([withIf('Bash(')], [{ exitCode: 0 }]);
    const outcome = await fire('PreToolUse');
    expect(runner.calls).toHaveLength(1);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ path: expect.stringMatching(/\.if$/) }),
    );
  });

  test('an `if` that keeps the handler from running still reports its issue', async () => {
    const { fire, runner } = engineSession([withIf('Bash(git *) && Bash(npm *)')], []);
    const outcome = await fire('PreToolUse');
    expect(runner.calls).toHaveLength(0);
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', path: expect.stringMatching(/\.if$/) }),
    );
  });
});
