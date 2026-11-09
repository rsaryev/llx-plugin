/**
 * Judgment (spec/judgments.md, `src/hooks/handlers/command/async.ts`): a command hook whose signal is
 * aborted is a cancelled run whatever the port answers (Node's `spawn({ signal })` reports the abort
 * as a start error, not an exit), and a signal aborted before the start runs no process.
 */
import { describe, expect, test } from 'bun:test';
import { entry } from '../support/hooks-select.ts';
import { engineSession } from '../support/hooks-session.ts';

const beforeBash = entry('PreToolUse', {
  matcher: 'Bash',
  handler: { type: 'command', command: './check.sh' },
});

describe('judgments: an aborted command hook is cancelled', () => {
  test('a signal aborted before the dispatch starts no process', async () => {
    const { fire, runner } = engineSession([beforeBash], [{ exitCode: 2, stderr: 'no' }]);
    const outcome = await fire('PreToolUse', { signal: AbortSignal.abort() });
    expect(runner.calls).toHaveLength(0);
    expect(outcome.runs[0]?.status).toBe('cancelled');
  });

  test('an abort the port answers with a start error is a cancelled run, not a hook error', async () => {
    const controller = new AbortController();
    const { fire } = engineSession(
      [beforeBash],
      [
        () => {
          controller.abort();
          return { startError: 'The operation was aborted', exitCode: null };
        },
      ],
    );
    const outcome = await fire('PreToolUse', { signal: controller.signal });
    expect(outcome.runs[0]?.status).toBe('cancelled');
    expect(outcome.issues).toEqual([]);
  });
});
