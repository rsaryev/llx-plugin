/**
 * hooks.md § "Exit code 0" (how stdout is read, which events show it to Claude), § "Exit code 2"
 * (what blocks, the stderr as the reason, the docs' `no-rm.sh` example) and § "Other exit codes"
 * (the `Failed with non-blocking status code:` notice and its examples).
 */
import { expect, test } from 'bun:test';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const INVALID = '{"nonsense": true}';

const pre = (code: number, stdout = '', stderr = '') =>
  verdictOf('PreToolUse', exited(code, stderr, stdout));

spec('hooks.behavior.Exit code 0', () => {
  test('JSON that cannot be parsed is a non-blocking error, not a success with fields applied', () => {
    const verdict = pre(0, '{"decision": }');
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.output).toBeUndefined();
    expect(verdict.block).toBeUndefined();
  });

  test('the action goes ahead unless the hook is one whose failure blocks the action', () => {
    const guard = { type: 'command', command: './g.sh', onFailure: 'block' } as const;
    expect(verdictOf('PreToolUse', exited(0, '', INVALID)).block).toBeUndefined();
    expect(verdictOf('PreToolUse', exited(0, '', INVALID), { hook: guard }).block).toBeDefined();
  });

  test('plain-text stdout of a command hook is not a failure, even with onFailure block', () => {
    const guard = { type: 'command', command: './g.sh', onFailure: 'block' } as const;
    expect(verdictOf('PreToolUse', exited(0, '', 'hello'), { hook: guard }).status).toBe('success');
  });

  test('output that does not start with { is plain text: an array and a quoted string too', () => {
    for (const text of ['hello', '[1,2]', '"quoted"', 'x {"a":1}']) {
      expect(pre(0, text).status).toBe('success');
    }
  });

  test('output that starts with { and does not end with } is plain text', () => {
    expect(pre(0, '{"systemMessage":"x"} done').status).toBe('success');
  });

  test('{...} that is not valid JSON is a parse failure', () => {
    expect(pre(0, '{not json}').status).toBe('non-blocking-error');
  });

  test('two or more JSON lines: plain text when no line sets a field, a parse failure when one does', () => {
    expect(pre(0, '{}\n{}').status).toBe('success');
    expect(pre(0, '{}\n{"systemMessage":"x"}').status).toBe('non-blocking-error');
  });

  test('one object on several lines with only whitespace around it is JSON output', () => {
    const verdict = pre(0, '\n  {\n  "systemMessage": "hi"\n}\n  ');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
  });

  test('UserPromptSubmit, UserPromptExpansion, SessionStart and PostModelSwitch add plain stdout as context; no other event does', () => {
    for (const event of [
      'UserPromptSubmit',
      'UserPromptExpansion',
      'SessionStart',
      'PostModelSwitch',
    ] as const) {
      expect(verdictOf(event, exited(0, '', 'ctx')).plainText).toEqual({
        text: 'ctx',
        as: 'context',
      });
      expect(verdictOf(event, exited(0, '', '{"nonsense":1}')).plainText).toBeUndefined();
    }
    expect(verdictOf('PostToolUse', exited(0, '', 'ctx')).plainText).toBeUndefined();
  });

  test('PreCompact stdout becomes the instructions for the compaction summary', () => {
    expect(verdictOf('PreCompact', exited(0, '', 'keep the plan')).plainText).toEqual({
      text: 'keep the plan',
      as: 'compaction-instructions',
    });
  });

  test('Claude never sees the stderr of a hook that exits 0', () => {
    const verdict = verdictOf('PostToolUse', exited(0, 'warning for nobody'));
    expect(verdict.feedback).toBeUndefined();
    expect(verdict.notice).toBeUndefined();
  });

  test('to warn Claude from PostToolUse or PostToolUseFailure, exit 2: Claude sees the stderr', () => {
    for (const event of ['PostToolUse', 'PostToolUseFailure'] as const) {
      const verdict = verdictOf(event, exited(2, 'tests broke'));
      expect(verdict.feedback).toMatchObject({ to: 'claude' });
      expect(verdict.feedback?.text).toContain('tests broke');
    }
  });
});

spec('hooks.behavior.Exit code 2', () => {
  test('a PreToolUse hook blocks the tool call, a UserPromptSubmit hook rejects the prompt', () => {
    expect(pre(2, '', 'x').block?.to).toBe('claude');
    const prompt = verdictOf('UserPromptSubmit', exited(2, 'no prompts'));
    expect(prompt.status).toBe('blocked');
    expect(prompt.block?.to).toBe('user');
  });

  test('the docs example: Claude receives the stderr prefixed with the event, the tool and the command', () => {
    const verdict = verdictOf('PreToolUse', exited(2, 'Blocked: rm commands are not allowed\n'), {
      hook: { type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/no-rm.sh' },
    });
    expect(verdict.block?.message).toBe(
      'PreToolUse:Bash hook error: [${CLAUDE_PROJECT_DIR}/.claude/hooks/no-rm.sh]: Blocked: rm commands are not allowed',
    );
  });

  test('exit 2 blocks even when the hook prints JSON that passes validation: an allow does not let the action through', () => {
    const allow = JSON.stringify({
      systemMessage: 'x',
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    });
    const verdict = pre(2, allow, 'denied');
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.reason).toBe('denied');
  });

  test('JSON that fails schema validation: the hook still blocks, the stderr is the reason', () => {
    const verdict = pre(2, INVALID, 'because');
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.reason).toBe('because');
    expect(verdict.output).toBeUndefined();
  });

  test('on Elicitation and ElicitationResult the hookSpecificOutput of an exit-2 hook is ignored', () => {
    const json = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept', content: {} },
    });
    expect(verdictOf('Elicitation', exited(2, 'no', json)).output).toBeUndefined();
  });
});

spec('hooks.behavior.Other exit codes', () => {
  test('the docs example: exit 1 with "something broke" on stderr', () => {
    const verdict = verdictOf('PreToolUse', exited(1, 'something broke\n'));
    expect(verdict.notice?.message).toBe(
      'PreToolUse:Bash hook error: [./hook.sh]: Failed with non-blocking status code: something broke',
    );
    expect(verdict.block).toBeUndefined();
  });

  test('a script path that does not exist: the notice carries the shell message and the hook never ran', () => {
    const stderr = '/bin/sh: /path/to/hook.sh: No such file or directory';
    const verdict = verdictOf('PreToolUse', exited(127, stderr));
    expect(verdict.notice?.message).toContain(`Failed with non-blocking status code: ${stderr}`);
    expect(verdict.block).toBeUndefined();
  });

  test('a hook that cannot start is a non-blocking error unless onFailure is "block"', () => {
    const run = { kind: 'not-started', message: 'spawn x ENOENT' } as const;
    expect(verdictOf('PreToolUse', run).block).toBeUndefined();
    const guarded = { type: 'command', command: './g', onFailure: 'block' } as const;
    expect(verdictOf('PreToolUse', run, { hook: guarded }).block).toBeDefined();
  });

  test('exit code 1 without valid JSON does not block, which is why a policy hook uses exit 2', () => {
    expect(pre(1, '', 'policy violation').block).toBeUndefined();
    expect(pre(2, '', 'policy violation').block).toBeDefined();
  });

  test('only the first line of stderr is in the notice', () => {
    const verdict = pre(1, '', 'line one\nline two');
    expect(verdict.notice?.message).toContain('line one');
    expect(verdict.notice?.message).not.toContain('line two');
  });
});
