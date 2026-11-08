/**
 * The engine end to end over the real select, input and run stages and fakes of the ports and of
 * the output stage: hooks.md § "Hook lifecycle" and § "How a hook resolves" (an event fires, the
 * matcher and `if` select, the handler runs, "Claude Code acts on the result"), § "Exit code
 * output", § "Exit code 2" and § "Block the action when a hook fails". The same ids as the unit
 * tests of the verdict stage, now proven through a dispatch.
 */
import { expect, test } from 'bun:test';
import type { HookHandler } from '../../src/protocol/hook-config.ts';
import { entry } from '../support/hooks-select.ts';
import { cmd, fire } from '../support/hooks-fire.ts';
import type { RunnerReply } from '../support/runner.ts';
import { spec } from '../support/spec.ts';

spec('hooks.exit2.PreToolUse', () => {
  test('a hook that exits 2 stops the tool call and Claude is told why', async () => {
    const hook = entry('PreToolUse', { matcher: 'Bash', handler: cmd() });
    const { outcome } = await fire(
      'PreToolUse',
      [hook],
      [{ exitCode: 2, stderr: 'Blocked: rm commands are not allowed' }],
    );
    expect(outcome.proceed).toBe(false);
    expect(outcome.block).toMatchObject({
      via: 'exit2',
      by: hook.id,
      reason: 'Blocked: rm commands are not allowed',
      message: 'PreToolUse:Bash hook error: [./guard.sh]: Blocked: rm commands are not allowed',
    });
  });

  test('exit 0 with no output has no decision: the tool call goes ahead', async () => {
    const hook = entry('PreToolUse', { matcher: 'Bash', handler: cmd() });
    const { outcome } = await fire('PreToolUse', [hook], [{ exitCode: 0 }]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  // The output stage is a stub (`fakeOutput`, tests/support/hooks-verdict.ts), and the stub defines
  // `by`: it reports a top-level `decision: 'block'` as the merged block of that hook. PreToolUse's
  // real decision field is `hookSpecificOutput.permissionDecision`; when `hooks/output` lands this
  // test must run through the real merge with `permissionDecision: "deny"` and
  // `permissionDecisionReason`. What this proves is only the engine's side: the merged block of the
  // same hook replaces the stderr (tests/hooks/assemble.test.ts covers a block of another hook).
  test("a hook that exits 2 with a JSON decision: the decision's reason replaces the stderr", async () => {
    const hook = entry('PreToolUse', { handler: cmd() });
    const json = JSON.stringify({ decision: 'block', reason: 'Policy says no' });
    const { outcome } = await fire(
      'PreToolUse',
      [hook],
      [{ exitCode: 2, stderr: 'raw stderr', stdout: json }],
    );
    expect(outcome.block).toMatchObject({ via: 'exit2', reason: 'Policy says no' });
  });
});

spec('hooks.exit2.PermissionRequest', () => {
  test('exit 2 is not honored: the permission flow proceeds unchanged', async () => {
    const hook = entry('PermissionRequest', { handler: cmd() });
    const { outcome } = await fire('PermissionRequest', [hook], [{ exitCode: 2, stderr: 'no' }]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.feedback).toEqual([]);
    expect(outcome.notices).toEqual([]);
  });
});

spec('hooks.exit2.WorktreeCreate', () => {
  test('any non-zero exit fails the creation; exit 0 hands over the path from stdout', async () => {
    const hook = entry('WorktreeCreate', { handler: cmd() });
    const failed = await fire('WorktreeCreate', [hook], [{ exitCode: 1, stderr: 'git failed' }]);
    expect(failed.outcome.proceed).toBe(false);
    const created = await fire('WorktreeCreate', [hook], [{ stdout: 'banner\n/work/wt\n' }]);
    expect(created.outcome.proceed).toBe(true);
    expect(created.outcome.stdout).toEqual(['banner\n/work/wt\n']);
  });
});

spec('hooks.handler.command.onFailure', () => {
  test('a hook script that is missing blocks the call with onFailure block, and not without', async () => {
    const reply: RunnerReply = { exitCode: 1, stderr: "Error: Cannot find module 'check.js'" };
    const guarded = entry('PreToolUse', { handler: cmd({ onFailure: 'block' }) });
    const blocked = await fire('PreToolUse', [guarded], [reply]);
    expect(blocked.outcome.proceed).toBe(false);
    expect(blocked.outcome.block?.via).toBe('failure');
    expect(blocked.outcome.block?.message).toBe(
      `PreToolUse:Bash hook error: [./guard.sh]: failed; blocking because onFailure is "block"\nError: Cannot find module 'check.js'`,
    );
    const open = entry('PreToolUse', { handler: cmd() });
    const ran = await fire('PreToolUse', [open], [reply]);
    expect(ran.outcome.proceed).toBe(true);
    expect(ran.outcome.notices[0]?.message).toContain('Failed with non-blocking status code:');
  });

  test('a runner that never starts the process is a failure that blocks', async () => {
    const guarded = entry('UserPromptSubmit', { handler: cmd({ onFailure: 'block' }) });
    const { outcome } = await fire('UserPromptSubmit', [guarded], [{ startError: 'spawn ENOENT' }]);
    expect(outcome.proceed).toBe(false);
  });

  test('a timeout blocks with onFailure block', async () => {
    const guarded = entry('PreToolUse', { handler: cmd({ onFailure: 'block' }) });
    const { outcome } = await fire('PreToolUse', [guarded], [{ timedOut: true }]);
    expect(outcome.block?.via).toBe('timeout');
  });
});

spec('hooks.handler.command.onFailure', () => {
  test('a UserPromptSubmit hook that times out, onFailure unset: the prompt goes ahead with a notice', async () => {
    const hook = entry('UserPromptSubmit', { handler: cmd({ timeout: 5 }) });
    const { outcome } = await fire('UserPromptSubmit', [hook], [{ timedOut: true }]);
    expect(outcome.proceed).toBe(true);
    expect(outcome.notices[0]?.message).toBe(
      "UserPromptSubmit hook error: [./guard.sh]: timed out after 5s; the hook's output was discarded",
    );
  });

  test('with no timeout of its own the event default is the one named: 30 seconds', async () => {
    const hook = entry('UserPromptSubmit', { handler: cmd() });
    const { outcome } = await fire('UserPromptSubmit', [hook], [{ timedOut: true }]);
    expect(outcome.notices[0]?.message).toContain('timed out after 30s');
  });
});

const web = (more: object = {}): HookHandler => ({ type: 'http', url: 'http://h/x', ...more });

spec('hooks.handler.http.onFailure', () => {
  test('a non-2xx status blocks with onFailure block and is a non-blocking error otherwise', async () => {
    const blocked = await fire(
      'PreToolUse',
      [entry('PreToolUse', { handler: web({ onFailure: 'block' }) })],
      [],
      {
        http: [{ status: 500, body: 'oops' }],
      },
    );
    expect(blocked.outcome.proceed).toBe(false);
    const open = await fire('PreToolUse', [entry('PreToolUse', { handler: web() })], [], {
      http: [{ status: 500, body: 'oops' }],
    });
    expect(open.outcome.proceed).toBe(true);
    expect(open.outcome.notices).toHaveLength(1);
  });

  test('a 2xx JSON body is read with the schema of command hooks', async () => {
    const json = JSON.stringify({ decision: 'block', reason: 'service says no' });
    const { outcome } = await fire('PreToolUse', [entry('PreToolUse', { handler: web() })], [], {
      http: [{ body: json }],
    });
    expect(outcome.block).toMatchObject({ via: 'decision', reason: 'service says no' });
  });
});
