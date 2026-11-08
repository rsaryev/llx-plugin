/**
 * hooks.md § "HTTP response handling": an HTTP hook uses status codes and bodies instead of exit
 * codes and stdout, never blocks by status alone, and each response or failure has its result.
 * Every result is asserted against its negative: the neighbouring response that must not read the
 * same way.
 */
import { expect, test } from 'bun:test';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const URL = 'https://hooks.example.test/pre';
const hook = { type: 'http', url: URL } as const;
const guarded = { type: 'http', url: URL, onFailure: 'block' } as const;
const reply = (status: number, body: string): RawRun => ({ kind: 'http', status, body });
const read = (run: RawRun, event: HookEvent = 'PreToolUse', handler = hook) =>
  verdictOf(event, run, { hook: handler });

spec('hooks.behavior.HTTP response handling', () => {
  test('a hook blocks a tool call by a 2xx response whose JSON body carries the decision', () => {
    const deny = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    });
    const verdict = read(reply(200, deny));
    expect(verdict.status).toBe('success');
    expect(verdict.output).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });
  });

  test('a request that fails or answers non-2xx blocks nothing by itself; onFailure "block" does', () => {
    expect(read(reply(500, '')).block).toBeUndefined();
    expect(read({ kind: 'http-failed', message: 'down' }).block).toBeUndefined();
    expect(read(reply(500, ''), 'PreToolUse', guarded).block).toBeDefined();
    expect(
      read({ kind: 'http-failed', message: 'down' }, 'PreToolUse', guarded).block,
    ).toBeDefined();
  });

  test('an event with its own failure contract, such as WorktreeCreate, fails even without onFailure', () => {
    expect(read(reply(500, ''), 'WorktreeCreate').block).toBeDefined();
    expect(read({ kind: 'http-failed', message: 'down' }, 'WorktreeCreate').block).toBeDefined();
    expect(read(reply(200, ''), 'WorktreeCreate').block).toBeUndefined();
  });
});

spec('hooks.behavior.HTTP response handling.2xx with an empty body', () => {
  test('is a success, equivalent to exit code 0 with no output', () => {
    const http = read(reply(200, ''));
    const command = verdictOf('PreToolUse', {
      kind: 'exited',
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(http.status).toBe('success');
    expect(http.status).toBe(command.status);
    expect(http.output).toBeUndefined();
    expect(http.block).toBeUndefined();
  });

  test('every 2xx status counts, a body of whitespace is empty, a 3xx is not 2xx', () => {
    for (const status of [200, 201, 204, 299])
      expect(read(reply(status, ' \n')).status).toBe('success');
    expect(read(reply(302, '')).status).toBe('non-blocking-error');
  });
});

spec('hooks.behavior.HTTP response handling.2xx with a JSON object body', () => {
  test('is parsed with the same JSON output schema as command hooks', () => {
    const body = '{"systemMessage":"checked","continue":true}';
    const http = read(reply(200, body));
    const command = verdictOf('PreToolUse', {
      kind: 'exited',
      exitCode: 0,
      stdout: body,
      stderr: '',
    });
    expect(http.output).toEqual({ systemMessage: 'checked', continue: true });
    expect(http.output).toEqual(command.output);
  });

  test('a body that fails schema validation is a non-blocking error', () => {
    const verdict = read(reply(200, '{"nonsense":true}'));
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.block).toBeUndefined();
    expect(verdict.output).toBeUndefined();
    expect(verdict.notice?.message).toContain('Unrecognized field: nonsense');
  });

  test('a JSON array or a quoted string is not an object body', () => {
    for (const body of ['[{"systemMessage":"x"}]', '"x"', '42']) {
      expect(read(reply(200, body)).status).toBe('non-blocking-error');
    }
  });
});

spec('hooks.behavior.HTTP response handling.Non-2xx status', () => {
  test('is a non-blocking error: the action goes ahead and the body is not read as a decision', () => {
    const deny = '{"decision":"block","reason":"no"}';
    for (const status of [301, 400, 403, 404, 500, 503]) {
      const verdict = read(reply(status, deny));
      expect(verdict.status).toBe('non-blocking-error');
      expect(verdict.block).toBeUndefined();
      expect(verdict.output).toBeUndefined();
      expect(verdict.notice?.message).toContain(String(status));
    }
  });

  test('2xx with any other body, such as plain text, is handled the same way, and its text is not added to context', () => {
    const verdict = read(reply(200, 'branch is main'), 'UserPromptSubmit');
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.plainText).toBeUndefined();
    expect(verdict.block).toBeUndefined();
  });
});

spec('hooks.behavior.HTTP response handling.Connection failure', () => {
  test('is a non-blocking error carrying the failure', () => {
    const verdict = read({ kind: 'http-failed', message: 'connect ECONNREFUSED 127.0.0.1:8080' });
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.block).toBeUndefined();
    expect(verdict.notice?.message).toContain('connect ECONNREFUSED 127.0.0.1:8080');
  });
});

spec('hooks.behavior.HTTP response handling.Timeout', () => {
  test('the hook is canceled and renders no decision, as under Timeouts', () => {
    const verdict = read({ kind: 'timed-out' });
    expect(verdict.status).toBe('timed-out');
    expect(verdict.output).toBeUndefined();
    expect(verdict.block).toBeUndefined();
  });

  test('a command hook that times out reads the same way', () => {
    const command = verdictOf('PreToolUse', { kind: 'timed-out' });
    expect(command.status).toBe(read({ kind: 'timed-out' }).status);
  });
});
