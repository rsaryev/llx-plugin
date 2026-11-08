/**
 * hooks.md § "Block the action when a hook fails": what counts as a failure (the five bullets),
 * what `"onFailure": "block"` does ("what exit code 2 does on that event, except on
 * `PermissionRequest`, where it denies the request"), and the hooks it has no effect on. The docs'
 * own example (a missing `check-command.js` on `PreToolUse:Bash`) is asserted verbatim.
 */
import { expect, test } from 'bun:test';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const SCRIPT = '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-command.js';
const NODE_ERROR = "Error: Cannot find module '/path/to/project/.claude/hooks/check-command.js'";
const guard = (more: object = {}): HookHandler => ({
  type: 'command',
  command: 'node',
  args: [SCRIPT],
  ...more,
});
const BLOCK = { onFailure: 'block' } as const;
const web = (more: object = {}): HookHandler => ({ type: 'http', url: 'http://h/x', ...more });

const blocks = (
  run: RawRun,
  hook: HookHandler,
  event: Parameters<typeof verdictOf>[0] = 'PreToolUse',
) => verdictOf(event, run, { hook }).block !== undefined;

spec('hooks.behavior.Block the action when a hook fails', () => {
  test('the docs example: a missing script blocks the Bash call, the error says why and carries node output', () => {
    const verdict = verdictOf('PreToolUse', exited(1, NODE_ERROR), { hook: guard(BLOCK) });
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.message).toBe(
      `PreToolUse:Bash hook error: [node ${SCRIPT}]: failed; blocking because onFailure is "block"\n${NODE_ERROR}`,
    );
  });

  test('without onFailure the same missing script is a non-blocking error and the call goes ahead', () => {
    const verdict = verdictOf('PreToolUse', exited(1, NODE_ERROR), { hook: guard() });
    expect(verdict.block).toBeUndefined();
    expect(verdict.status).toBe('non-blocking-error');
  });

  test('after a timeout the message says "timed out" instead of "failed"', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'timed-out' }, { hook: guard(BLOCK) });
    expect(verdict.block?.message).toBe(
      `PreToolUse:Bash hook error: [node ${SCRIPT}]: timed out; blocking because onFailure is "block"`,
    );
  });

  test('a failure does what exit 2 does on that event: a PreToolUse failure blocks the call, a UserPromptSubmit failure the prompt', () => {
    expect(verdictOf('PreToolUse', exited(1, 'x'), { hook: guard(BLOCK) }).block?.to).toBe(
      'claude',
    );
    const prompt = verdictOf('UserPromptSubmit', exited(1, 'x'), { hook: guard(BLOCK) });
    expect(prompt.block?.to).toBe('user');
    expect(prompt.status).toBe('blocked');
  });

  test('except on PermissionRequest, where it denies the request (exit 2 itself is not honored there)', () => {
    expect(blocks(exited(1, 'x'), guard(BLOCK), 'PermissionRequest')).toBe(true);
    expect(blocks(exited(2, 'x'), guard(BLOCK), 'PermissionRequest')).toBe(false);
  });

  test('where exit 2 only shows stderr (PostToolUse) a failure shows it too and blocks nothing', () => {
    const verdict = verdictOf('PostToolUse', exited(1, 'x'), { hook: guard(BLOCK) });
    expect(verdict.block).toBeUndefined();
    expect(verdict.feedback?.text).toContain('failed; blocking because onFailure is "block"');
  });

  test('the field has no effect on Stop, SubagentStop, TaskCompleted and TeammateIdle', () => {
    for (const event of ['Stop', 'SubagentStop', 'TaskCompleted', 'TeammateIdle'] as const) {
      expect(blocks(exited(1, 'x'), guard(BLOCK), event)).toBe(false);
      expect(blocks({ kind: 'timed-out' }, guard(BLOCK), event)).toBe(false);
    }
  });
});

spec(`hooks.behavior.Block the action when a hook fails.Can't start`, () => {
  const run: RawRun = { kind: 'not-started', message: 'spawn node ENOENT' };
  test('a command hook that fails to start counts as a failure', () => {
    expect(blocks(run, guard(BLOCK))).toBe(true);
  });
  test('without onFailure it is a non-blocking error', () => {
    expect(blocks(run, guard())).toBe(false);
  });
  test('the program or script that does not exist: a hook that ran and exited 0 is not one', () => {
    expect(blocks(exited(0), guard(BLOCK))).toBe(false);
  });
});

spec('hooks.behavior.Block the action when a hook fails.Exit code other than 0 or 2', () => {
  const allow = JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
  });

  test('counts for a command hook even if it printed JSON that allows the action', () => {
    expect(blocks(exited(1, 'x', allow), guard(BLOCK))).toBe(true);
    // Without onFailure the JSON decides: nothing blocks.
    expect(blocks(exited(1, 'x', allow), guard())).toBe(false);
  });

  test('exit 0 with that JSON is the way to return a JSON decision', () => {
    expect(blocks(exited(0, '', allow), guard(BLOCK))).toBe(false);
  });

  test('exit 2 is not a failure: it blocks as exit 2 does, with the stderr as reason', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'policy'), { hook: guard(BLOCK) });
    expect(verdict.block?.via).toBe('exit2');
    expect(verdict.block?.reason).toBe('policy');
  });
});

spec('hooks.behavior.Block the action when a hook fails.HTTP error', () => {
  test('the connection fails', () => {
    expect(blocks({ kind: 'http-failed', message: 'ECONNREFUSED' }, web(BLOCK))).toBe(true);
    expect(blocks({ kind: 'http-failed', message: 'ECONNREFUSED' }, web())).toBe(false);
  });

  test('the response status is not 2xx', () => {
    for (const status of [199, 301, 404, 500]) {
      expect(blocks({ kind: 'http', status, body: '' }, web(BLOCK))).toBe(true);
    }
    for (const status of [200, 204, 299]) {
      expect(blocks({ kind: 'http', status, body: '' }, web(BLOCK))).toBe(false);
    }
  });
});

spec('hooks.behavior.Block the action when a hook fails.Timeout', () => {
  test('a command hook that reaches its timeout is a failure; the block says it timed out', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'timed-out' }, { hook: guard(BLOCK) });
    expect(verdict.block?.via).toBe('timeout');
    expect(verdict.block?.reason).toContain('timed out');
  });

  test('so is an http hook; without onFailure neither blocks the tool call', () => {
    expect(blocks({ kind: 'timed-out' }, web(BLOCK))).toBe(true);
    expect(blocks({ kind: 'timed-out' }, web())).toBe(false);
    expect(blocks({ kind: 'timed-out' }, guard())).toBe(false);
  });
});

spec('hooks.behavior.Block the action when a hook fails.Invalid output', () => {
  test('JSON that cannot be parsed or fails schema validation is a failure', () => {
    expect(blocks(exited(0, '', '{"decision": }'), guard(BLOCK))).toBe(true);
    expect(blocks(exited(0, '', '{"nonsense":true}'), guard(BLOCK))).toBe(true);
    expect(blocks(exited(0, '', '{"nonsense":true}'), guard())).toBe(false);
  });

  test('plain-text stdout from a command hook is not a failure', () => {
    for (const stdout of ['', 'all good', '[1, 2]', '"text"']) {
      expect(verdictOf('PreToolUse', exited(0, '', stdout), { hook: guard(BLOCK) }).status).toBe(
        'success',
      );
    }
  });

  test('for an HTTP hook a 2xx body that is neither empty nor a JSON object also counts', () => {
    for (const body of ['ok', '[1]', '"x"', '{"nonsense":1}']) {
      expect(blocks({ kind: 'http', status: 200, body }, web(BLOCK))).toBe(true);
    }
    expect(blocks({ kind: 'http', status: 200, body: '' }, web(BLOCK))).toBe(false);
    expect(blocks({ kind: 'http', status: 200, body: '{}' }, web(BLOCK))).toBe(false);
  });
});

spec('hooks.behavior.Block the action when a hook fails.Background command hooks', () => {
  const never = new Promise<never>(() => undefined);

  test('async and asyncRewake command hooks are not turned into a block by onFailure', () => {
    for (const flags of [{ async: true }, { asyncRewake: true }]) {
      const hook = guard({ ...BLOCK, ...flags });
      expect(verdictOf('PostToolUse', { kind: 'background', done: never }, { hook }).block).toBe(
        undefined,
      );
      // Even when the process could not start.
      expect(blocks({ kind: 'not-started', message: 'x' }, hook)).toBe(false);
      expect(blocks(exited(1, 'x'), hook)).toBe(false);
    }
  });

  test('the same hook without async does block', () => {
    expect(blocks(exited(1, 'x'), guard(BLOCK))).toBe(true);
  });
});
