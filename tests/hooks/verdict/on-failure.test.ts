/**
 * `onFailure` of command and http hooks: hooks.md § "Command hook fields" and § "HTTP hook fields"
 * (the field), § "Block the action when a hook fails" (what counts as a failure, what `"block"`
 * does, the hooks it has no effect on) and § "Timeouts" (a timed-out hook, `PreModelSwitch`).
 * Messages the docs quote are asserted verbatim.
 */
import { describe, expect, test } from 'bun:test';
import type { RawRun } from '../../../src/hooks/handlers/index.ts';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const script = '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-command.js';
const guard = (more: object = {}): HookHandler => ({
  type: 'command',
  command: 'node',
  args: [script],
  ...more,
});
const BLOCK = { onFailure: 'block' } as const;
const NODE_ERROR = "Error: Cannot find module '/path/to/project/.claude/hooks/check-command.js'";

/** The five failures of the docs, as runs a command hook can end with. */
const COMMAND_FAILURES: Record<string, RawRun> = {
  'cannot start': { kind: 'not-started', message: 'spawn node ENOENT' },
  'exit code other than 0 or 2': exited(1, NODE_ERROR),
  timeout: { kind: 'timed-out' },
  'invalid output (not parseable)': exited(0, '', '{"decision": }'),
  'invalid output (fails validation)': exited(0, '', '{"nonsense": true}'),
};

spec('hooks.handler.command.onFailure', () => {
  test('block: the docs example, a missing script on PreToolUse blocks the Bash call', () => {
    const verdict = verdictOf('PreToolUse', exited(1, NODE_ERROR), { hook: guard(BLOCK) });
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.via).toBe('failure');
    expect(verdict.block?.message).toBe(
      `PreToolUse:Bash hook error: [node ${script}]: failed; blocking because onFailure is "block"\n${NODE_ERROR}`,
    );
  });

  test('block: a timeout says "timed out" instead of "failed"', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'timed-out' }, { hook: guard(BLOCK) });
    expect(verdict.block?.via).toBe('timeout');
    expect(verdict.block?.message).toBe(
      `PreToolUse:Bash hook error: [node ${script}]: timed out; blocking because onFailure is "block"`,
    );
  });

  for (const [name, run] of Object.entries(COMMAND_FAILURES)) {
    test(`block: ${name} counts as a failure`, () => {
      expect(verdictOf('PreToolUse', run, { hook: guard(BLOCK) }).block).toBeDefined();
    });
    test(`unset: ${name} is a non-blocking error and the action goes ahead`, () => {
      const verdict = verdictOf('PreToolUse', run, { hook: guard() });
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).not.toBe('blocked');
    });
    test(`continue: ${name} lets the action go ahead`, () => {
      const hook = guard({ onFailure: 'continue' });
      expect(verdictOf('PreToolUse', run, { hook }).block).toBeUndefined();
    });
  }

  test('an exit code other than 0 or 2 counts even when the hook printed JSON that allows', () => {
    const allow = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } });
    expect(
      verdictOf('PreToolUse', exited(1, '', allow), { hook: guard(BLOCK) }).block,
    ).toBeDefined();
    // Without onFailure "the fields alone decide": the JSON still applies.
    const open = verdictOf('PreToolUse', exited(1, '', allow), { hook: guard() });
    expect(open.block).toBeUndefined();
    expect(open.output).toBeDefined();
  });

  test('plain-text stdout from a command hook is not a failure', () => {
    for (const stdout of ['', 'all good', '[1, 2]']) {
      const verdict = verdictOf('PreToolUse', exited(0, '', stdout), { hook: guard(BLOCK) });
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).toBe('success');
    }
  });

  test('exit 2 is not a failure: it blocks as exit 2 does, with or without onFailure', () => {
    for (const hook of [guard(BLOCK), guard()]) {
      expect(verdictOf('PreToolUse', exited(2, 'no'), { hook }).block?.via).toBe('exit2');
    }
  });

  test('a failure does what exit 2 does on that event: UserPromptSubmit blocks the prompt', () => {
    const verdict = verdictOf('UserPromptSubmit', exited(1, 'crash'), { hook: guard(BLOCK) });
    expect(verdict.block?.via).toBe('failure');
    expect(verdict.block?.reason).toContain('failed; blocking because onFailure is "block"');
  });

  test('a failure does what exit 2 does where exit 2 only shows stderr: PostToolUse tells Claude', () => {
    const verdict = verdictOf('PostToolUse', exited(1, 'crash'), { hook: guard(BLOCK) });
    expect(verdict.block).toBeUndefined();
    expect(verdict.feedback?.to).toBe('claude');
    expect(verdict.feedback?.text).toContain(
      'failed; blocking because onFailure is "block"\ncrash',
    );
  });

  test('PermissionRequest: a failure denies the request', () => {
    const verdict = verdictOf('PermissionRequest', exited(1, 'crash'), { hook: guard(BLOCK) });
    expect(verdict.block?.via).toBe('failure');
    // Exit 2 on this event is not honored, a failure with block denies.
    expect(
      verdictOf('PermissionRequest', exited(2, 'no'), { hook: guard(BLOCK) }).block,
    ).toBeUndefined();
  });

  describe('no effect on Stop, SubagentStop, TaskCompleted and TeammateIdle', () => {
    const events: HookEvent[] = ['Stop', 'SubagentStop', 'TaskCompleted', 'TeammateIdle'];
    for (const event of events) {
      test(event, () => {
        for (const run of Object.values(COMMAND_FAILURES)) {
          expect(verdictOf(event, run, { hook: guard(BLOCK) }).block).toBeUndefined();
        }
        // The fields of a hook that exits 1 with valid JSON still decide: it is not read as a failure.
        const json = verdictOf(event, exited(1, '', '{"decision":"block","reason":"x"}'), {
          hook: guard(BLOCK),
        });
        expect(json.status).toBe('success');
        expect(json.output).toBeDefined();
      });
    }
  });

  test('no effect on background command hooks (async and asyncRewake)', () => {
    const done = Promise.resolve({ run: { kind: 'not-started', message: 'x' } as const });
    for (const flags of [{ async: true }, { asyncRewake: true }]) {
      const verdict = verdictOf(
        'PostToolUse',
        { kind: 'background', done },
        {
          hook: guard({ ...BLOCK, ...flags }),
        },
      );
      expect(verdict.status).toBe('background');
      expect(verdict.block).toBeUndefined();
    }
    // A background hook whose process could not start is not turned into a block either.
    const started = verdictOf(
      'PreToolUse',
      { kind: 'not-started', message: 'x' },
      {
        hook: guard({ ...BLOCK, async: true }),
      },
    );
    expect(started.block).toBeUndefined();
  });

  test('PreModelSwitch: a hook canceled at its timeout blocks the switch even without onFailure', () => {
    const verdict = verdictOf('PreModelSwitch', { kind: 'timed-out' }, { hook: guard() });
    expect(verdict.block?.via).toBe('timeout');
    // Judgment: an explicit "continue" lets the switch go ahead (spec/judgments.md).
    const open = verdictOf(
      'PreModelSwitch',
      { kind: 'timed-out' },
      {
        hook: guard({ onFailure: 'continue' }),
      },
    );
    expect(open.block).toBeUndefined();
  });

  test('PreToolUse: a timed-out hook does not block the tool call', () => {
    expect(verdictOf('PreToolUse', { kind: 'timed-out' }, { hook: guard() }).block).toBeUndefined();
  });
});

const URL = 'http://localhost:8080/hooks/pre-tool-use';
const web = (more: object = {}): HookHandler => ({ type: 'http', url: URL, ...more });
const HTTP_FAILURES: Record<string, RawRun> = {
  'connection failure': { kind: 'http-failed', message: 'connect ECONNREFUSED' },
  'non-2xx status': { kind: 'http', status: 503, body: 'down' },
  timeout: { kind: 'timed-out' },
  '2xx plain-text body': { kind: 'http', status: 200, body: 'ok then' },
  '2xx body that is not JSON': { kind: 'http', status: 200, body: '{"decision": ' },
  '2xx body that fails validation': { kind: 'http', status: 200, body: '{"nonsense":true}' },
};

spec('hooks.handler.http.onFailure', () => {
  for (const [name, run] of Object.entries(HTTP_FAILURES)) {
    test(`block: ${name} blocks the tool call`, () => {
      const verdict = verdictOf('PreToolUse', run, { hook: web(BLOCK) });
      expect(verdict.status).toBe('blocked');
      expect(verdict.block?.message).toContain('blocking because onFailure is "block"');
    });
    test(`continue (the default): ${name} is a non-blocking error`, () => {
      expect(verdictOf('PreToolUse', run, { hook: web() }).block).toBeUndefined();
      expect(
        verdictOf('PreToolUse', run, { hook: web({ onFailure: 'continue' }) }).block,
      ).toBeUndefined();
    });
  }

  test('the message names the hook by its URL and says "timed out" after a timeout', () => {
    const verdict = verdictOf('PreToolUse', { kind: 'timed-out' }, { hook: web(BLOCK) });
    expect(verdict.block?.message).toBe(
      `PreToolUse:Bash hook error: [${URL}]: timed out; blocking because onFailure is "block"`,
    );
  });

  test('a 2xx empty body and a 2xx JSON object are not failures', () => {
    const empty = verdictOf(
      'PreToolUse',
      { kind: 'http', status: 204, body: '' },
      { hook: web(BLOCK) },
    );
    const json = verdictOf(
      'PreToolUse',
      { kind: 'http', status: 200, body: '{"continue":true}' },
      { hook: web(BLOCK) },
    );
    for (const verdict of [empty, json]) {
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).toBe('success');
    }
  });

  test('a failure does what exit 2 does on that event, and denies on PermissionRequest', () => {
    const run: RawRun = { kind: 'http', status: 500, body: '' };
    expect(verdictOf('UserPromptSubmit', run, { hook: web(BLOCK) }).block).toBeDefined();
    expect(verdictOf('PermissionRequest', run, { hook: web(BLOCK) }).block).toBeDefined();
    expect(verdictOf('Stop', run, { hook: web(BLOCK) }).block).toBeUndefined();
  });
});
