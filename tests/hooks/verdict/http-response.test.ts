/**
 * HTTP response handling: hooks.md § "HTTP response handling" (the six bullets) and § "HTTP hook
 * fields". The ids of the `http` hook fields are proven by the handler tests; what a status or a
 * body means is the verdict stage's and no id names it, so these tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import { verdictOf } from '../../support/hooks-verdict.ts';

const http = (status: number, body: string): RawRun => ({ kind: 'http', status, body });
const read = (run: RawRun) =>
  verdictOf('PreToolUse', run, { hook: { type: 'http', url: 'http://h/x' } });

describe('HTTP response handling', () => {
  test('2xx with an empty body is a success, equivalent to exit 0 with no output', () => {
    for (const body of ['', '  \n']) {
      const verdict = read(http(200, body));
      expect(verdict.status).toBe('success');
      expect(verdict.output).toBeUndefined();
    }
  });

  test('2xx with a JSON object body is parsed with the schema of command hooks', () => {
    const verdict = read(http(200, '{"systemMessage":"hi"}'));
    expect(verdict.status).toBe('success');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
    expect(read(http(204, '{"systemMessage":"hi"}')).output).toBeDefined();
  });

  test('a body that fails schema validation is a non-blocking error', () => {
    const verdict = read(http(200, '{"nonsense":1}'));
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.block).toBeUndefined();
    expect(verdict.notice?.message).toContain('Unrecognized field: nonsense');
  });

  test('2xx with any other body is a non-blocking error and its text is not added to context', () => {
    for (const body of ['ok', '[1]', '"text"']) {
      const verdict = read(http(200, body));
      expect(verdict.status).toBe('non-blocking-error');
      expect(verdict.plainText).toBeUndefined();
    }
    const context = verdictOf('UserPromptSubmit', http(200, 'branch is main'), {
      hook: { type: 'http', url: 'http://h/x' },
    });
    expect(context.plainText).toBeUndefined();
  });

  test('a non-2xx status and a connection failure are non-blocking errors', () => {
    for (const run of [
      http(404, ''),
      http(500, '{"decision":"block"}'),
      http(301, ''),
      http(199, ''),
    ]) {
      const verdict = read(run);
      expect(verdict.status).toBe('non-blocking-error');
      expect(verdict.block).toBeUndefined();
      expect(verdict.output).toBeUndefined();
    }
    const failed = read({ kind: 'http-failed', message: 'connect ECONNREFUSED' });
    expect(failed.status).toBe('non-blocking-error');
  });

  test('a timeout cancels the hook and renders no decision', () => {
    const verdict = read({ kind: 'timed-out' });
    expect(verdict.status).toBe('timed-out');
    expect(verdict.output).toBeUndefined();
  });

  test('an HTTP hook never blocks by status alone: the decision is in a 2xx JSON body', () => {
    expect(read(http(403, '')).block).toBeUndefined();
  });

  test('WorktreeCreate has its own failure contract: a failed HTTP hook fails the creation', () => {
    const verdict = verdictOf('WorktreeCreate', http(500, ''), {
      hook: { type: 'http', url: 'http://h/x' },
    });
    expect(verdict.block?.via).toBe('failure');
  });
});
