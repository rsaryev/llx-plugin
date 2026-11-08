/**
 * Where the stderr of an exit-2 hook is rendered for the events that notify: hooks.md § "Exit code 2
 * behavior per event" (the paragraph under the table: `SessionStart`, `SubagentStart` and
 * `PostModelSwitch` render it as a `<hook name> hook error` notice Claude does not see) and
 * § "PostToolBatch" ("a warning in the transcript, and it stays in the conversation").
 */
import { expect, test } from 'bun:test';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const STDERR = 'No rm for you';

spec('hooks.exit2.SessionStart', () => notifiedOnly('SessionStart'));
spec('hooks.exit2.SubagentStart', () => notifiedOnly('SubagentStart'));
spec('hooks.exit2.PostModelSwitch', () => notifiedOnly('PostModelSwitch'));

/**
 * "For `SessionStart`, `SubagentStart`, and `PostModelSwitch`, Claude Code renders the exit code 2
 * stderr in the transcript as a `<hook name> hook error` notice ... Claude doesn't see it".
 */
function notifiedOnly(event: HookEvent) {
  test('exit 2 renders the stderr as a `<Event> hook error` notice that Claude does not see', () => {
    const verdict = verdictOf(event, exited(2, STDERR));
    expect(verdict.notice?.message).toBe(`${event} hook error: [./hook.sh]: ${STDERR}`);
    expect(verdict.feedback).toBeUndefined();
    expect(verdict.block).toBeUndefined();
  });
}

spec('hooks.exit2.PostToolBatch', () => {
  test('the stop is a warning in the transcript and stays in the conversation for Claude', () => {
    const verdict = verdictOf('PostToolBatch', exited(2, STDERR));
    const line = `PostToolBatch hook error: [./hook.sh]: ${STDERR}`;
    expect(verdict.block).toMatchObject({ via: 'exit2', to: 'user-and-claude', message: line });
    expect(verdict.notice).toEqual({ handlerId: verdict.handler.id, message: line });
    expect(verdict.feedback).toEqual({ handlerId: verdict.handler.id, to: 'claude', text: line });
  });

  test('a failure that blocks does what exit 2 does: the same warning and feedback', () => {
    const hook: HookHandler = { type: 'command', command: './hook.sh', onFailure: 'block' };
    const verdict = verdictOf('PostToolBatch', exited(1, STDERR), { hook });
    expect(verdict.block).toMatchObject({ via: 'failure', to: 'user-and-claude' });
    expect(verdict.notice?.message).toBe(verdict.block?.message);
    expect(verdict.feedback).toMatchObject({ to: 'claude', text: verdict.block?.message });
  });
});
