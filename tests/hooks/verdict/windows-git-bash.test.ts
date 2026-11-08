/**
 * Failed hooks on Windows without Git Bash: hooks.md § "Block the action when a hook fails" (the
 * note) and § "Failed hooks on Windows without Git Bash". No requirement id names it, so the tests
 * sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { interpretRun } from '../../../src/hooks/index.ts';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { entry, FACTS } from '../../support/hooks-select.ts';
import { exited } from '../../support/hooks-verdict.ts';

const MESSAGE =
  "blocking because Git Bash wasn't found, so only exit code 0 or 2 counts as this hook's verdict.";

const read = (event: HookEvent, hook: HookHandler, run: RawRun, gitBashMissing = true) =>
  interpretRun(entry(event, { handler: hook }), run, {
    event,
    facts: FACTS[event],
    parse: (_event, json) => ({ output: Object(json) }),
    gitBashMissing,
  });

const shellForm: HookHandler = { type: 'command', command: 'check.cmd' };

describe('without Git Bash, a shell-form PreToolUse or PermissionRequest hook is a gate', () => {
  test('any exit code other than 0 or 2 blocks, even with JSON that does not deny', () => {
    for (const event of ['PreToolUse', 'PermissionRequest'] as const) {
      const verdict = read(event, shellForm, exited(1, 'oops', '{"systemMessage":"warn"}'));
      expect(verdict.block?.message).toContain(MESSAGE);
      expect(verdict.block?.reason).toBe(`${MESSAGE}\noops`);
    }
  });

  test('a timeout and a hook that could not start block too', () => {
    expect(read('PreToolUse', shellForm, { kind: 'timed-out' }).block?.reason).toBe(MESSAGE);
    expect(
      read('PreToolUse', shellForm, { kind: 'not-started', message: 'x' }).block,
    ).toBeDefined();
  });

  test('exit 0 and exit 2 keep their own meaning', () => {
    expect(read('PreToolUse', shellForm, exited(0)).block).toBeUndefined();
    expect(read('PreToolUse', shellForm, exited(2, 'no')).block?.via).toBe('exit2');
  });

  test('"onFailure": "continue" lets the call go ahead; "block" blocks with its own message', () => {
    const open = read('PreToolUse', { ...shellForm, onFailure: 'continue' }, exited(1, 'oops'));
    expect(open.block).toBeUndefined();
    const closed = read('PreToolUse', { ...shellForm, onFailure: 'block' }, exited(1, 'oops'));
    expect(closed.block?.reason).toContain('failed; blocking because onFailure is "block"');
  });

  test('an exec-form hook is not a gate: it starts with no shell', () => {
    const exec: HookHandler = { type: 'command', command: 'check.exe', args: [] };
    expect(read('PreToolUse', exec, exited(1, 'oops')).block).toBeUndefined();
  });

  test('other events and an HTTP hook are not gates', () => {
    expect(read('PostToolUse', shellForm, exited(1, 'oops')).block).toBeUndefined();
    const web: HookHandler = { type: 'http', url: 'http://h/x' };
    expect(read('PreToolUse', web, { kind: 'http', status: 500, body: '' }).block).toBeUndefined();
  });

  test('with Git Bash the same failure goes ahead', () => {
    expect(read('PreToolUse', shellForm, exited(1, 'oops'), false).block).toBeUndefined();
  });
});
