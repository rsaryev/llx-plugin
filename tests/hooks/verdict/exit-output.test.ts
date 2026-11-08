/**
 * hooks.md § "Exit code output" (the three outcomes, the table of stdout against exit code, the
 * events with their own rules), § "Exit code 0", § "Exit code 2" and § "Other exit codes". Every
 * example the docs print is asserted verbatim; each outcome has its negative case beside it.
 */
import { describe, expect, test } from 'bun:test';
import type { HandlerVerdict, RegisteredHandler } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { entry, pluginSource } from '../../support/hooks-select.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

const VALID = JSON.stringify({ systemMessage: 'hi' });
const INVALID = '{"nonsense": true}';

const pre = (code: number, stdout = '', stderr = '') =>
  verdictOf('PreToolUse', exited(code, stderr, stdout));

const blocksCall = (verdict: HandlerVerdict): boolean => verdict.block !== undefined;

spec('hooks.behavior.Exit code output', () => {
  test('exit 0, 2 and any other code are the three columns of the table', () => {
    expect(pre(0).status).toBe('success');
    expect(pre(2, '', 'no').status).toBe('blocked');
    expect(pre(1, '', 'no').status).toBe('non-blocking-error');
  });

  test('a PreToolUse hook that exits 1 but prints valid JSON still decides through that JSON', () => {
    const verdict = pre(1, VALID, 'ignored');
    expect(verdict.status).toBe('success');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
    expect(blocksCall(verdict)).toBe(false);
  });

  test('for a hook whose failure blocks the action, exit 1 with valid JSON counts as a failure instead', () => {
    const guard = { type: 'command', command: './g.sh', onFailure: 'block' } as const;
    const verdict = verdictOf('PreToolUse', exited(1, 'ignored', VALID), { hook: guard });
    expect(verdict.status).toBe('blocked');
    expect(verdict.block).toMatchObject({ via: 'failure', to: 'claude' });
    expect(verdict.output).toBeUndefined();
    // The same exit with valid JSON on the default hook is a success, as the test above says.
    expect(pre(1, VALID, 'ignored').status).toBe('success');
  });

  test('the notice of a non-blocking error is the hook error line of the event and tool', () => {
    expect(pre(1, '', 'boom').notice?.message).toBe(
      'PreToolUse:Bash hook error: [./hook.sh]: Failed with non-blocking status code: boom',
    );
  });
});

spec('hooks.behavior.Exit code output.Success', () => {
  test('exit 0 applies the JSON fields and lets the action go ahead', () => {
    const verdict = pre(0, VALID);
    expect(verdict.status).toBe('success');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
    expect(verdict.block).toBeUndefined();
  });

  test('exit 0 is not a success when the JSON it printed is invalid: that is a non-blocking error', () => {
    expect(pre(0, INVALID).status).toBe('non-blocking-error');
  });
});

spec('hooks.behavior.Exit code output.Blocking error', () => {
  test('exit 2 stops the action on an event that can block', () => {
    const verdict = pre(2, '', 'stop');
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.reason).toBe('stop');
  });

  test('exit 2 on an event that cannot block (PostToolUse) blocks nothing', () => {
    const verdict = verdictOf('PostToolUse', exited(2, 'too late'));
    expect(verdict.block).toBeUndefined();
    expect(verdict.status).toBe('non-blocking-error');
  });
});

spec('hooks.behavior.Exit code output.Non-blocking error', () => {
  test('any other exit code lets the action go ahead and leaves a notice', () => {
    const verdict = pre(3, '', 'oops');
    expect(verdict.status).toBe('non-blocking-error');
    expect(verdict.block).toBeUndefined();
    expect(verdict.notice?.message).toContain('oops');
  });

  test('so do a hook that cannot start and invalid JSON', () => {
    const notStarted = verdictOf('PreToolUse', { kind: 'not-started', message: 'ENOENT' });
    expect(notStarted.status).toBe('non-blocking-error');
    expect(notStarted.block).toBeUndefined();
    expect(pre(0, '{"a": }').status).toBe('non-blocking-error');
  });

  test('the exception: a hook with onFailure "block" blocks on those failures', () => {
    const verdict = verdictOf('PreToolUse', exited(3, 'oops'), {
      hook: { type: 'command', command: './h.sh', onFailure: 'block' },
    });
    expect(verdict.block).toBeDefined();
  });
});

spec('hooks.behavior.Exit code output.Plain text, or nothing', () => {
  for (const [name, stdout] of [
    ['nothing', ''],
    ['plain text', 'all good'],
  ] as const) {
    test(`${name}: exit 0 is a success, exit 2 a blocking error with the stderr as reason, another code a non-blocking error with the first stderr line`, () => {
      expect(pre(0, stdout).status).toBe('success');
      expect(pre(2, stdout, 'why\nmore').block?.reason).toBe('why\nmore');
      expect(pre(1, stdout, 'first\nsecond').notice?.message).toContain(
        'Failed with non-blocking status code: first',
      );
      expect(pre(1, stdout, 'first\nsecond').notice?.message).not.toContain('second');
    });
  }
});

describe('the table: JSON that passes schema validation', () => {
  test('exit 2: still read, but the fields cannot override the block', () => {
    const verdict = pre(2, VALID, 'stderr');
    expect(verdict.status).toBe('blocked');
    expect(verdict.output).toEqual({ systemMessage: 'hi' });
  });
});

describe('the table: JSON that cannot be parsed or fails schema validation', () => {
  test('exit 0 and any other code: a non-blocking error carrying the parse or validation message', () => {
    for (const code of [0, 5]) {
      const verdict = pre(code, INVALID);
      expect(verdict.status).toBe('non-blocking-error');
      expect(verdict.notice?.message).toContain('Unrecognized field: nonsense');
    }
    expect(pre(0, '{"a": }').notice?.message).toMatch(/hook error: \[\.\/hook\.sh\]: .+/);
  });

  test('exit 2: a blocking error, the stderr is the reason', () => {
    expect(pre(2, INVALID, 'because').block?.reason).toBe('because');
  });
});

describe('events with their own rules', () => {
  const missing = 'cat: ./gate.sh: No such file or directory';

  test('WorktreeCreate: any non-zero exit code fails creation, whatever the JSON says', () => {
    for (const code of [1, 2, 127]) {
      const verdict = verdictOf('WorktreeCreate', exited(code, 'git failed', VALID));
      expect(verdict.status).toBe('blocked');
    }
    expect(verdictOf('WorktreeCreate', exited(0, '', '/work/wt')).status).toBe('success');
  });

  test('Stop, SubagentStop and TaskCompleted: exit 2, nothing on stdout and a missing file is a non-blocking error', () => {
    for (const event of ['Stop', 'SubagentStop', 'TaskCompleted'] as const) {
      const verdict = verdictOf(event, exited(2, missing));
      expect(verdict.block).toBeUndefined();
      expect(verdict.status).toBe('non-blocking-error');
      const real = verdictOf(event, exited(2, 'keep going'));
      expect(real.status).toBe('blocked');
    }
  });

  test('a missing file with something on stdout is still a block', () => {
    expect(verdictOf('Stop', exited(2, missing, 'text')).status).toBe('blocked');
  });

  test("a plugin's UserPromptSubmit hook gets the same exception; a settings hook does not", () => {
    const plugin: RegisteredHandler = entry('UserPromptSubmit', { source: pluginSource('p') });
    expect(
      verdictOf('UserPromptSubmit', exited(2, missing), { entry: plugin }).block,
    ).toBeUndefined();
    expect(verdictOf('UserPromptSubmit', exited(2, missing)).status).toBe('blocked');
  });

  test('Elicitation and ElicitationResult: hookSpecificOutput applies on exit 0 and is ignored on any other code', () => {
    const answer = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'Elicitation', action: 'accept', content: { a: 1 } },
    });
    for (const event of ['Elicitation', 'ElicitationResult'] as const) {
      const json = answer.replace('"Elicitation"', `"${event}"`);
      expect(verdictOf(event, exited(0, '', json)).output).toBeDefined();
      for (const code of [1, 2]) {
        expect(verdictOf(event, exited(code, 'e', json)).output).toBeUndefined();
      }
    }
  });
});

spec('hooks.behavior.Exit code output.WorktreeCreate', () => {
  test('any non-zero exit code makes worktree creation fail, whatever the JSON says', () => {
    for (const code of [1, 2, 9]) {
      const verdict = verdictOf('WorktreeCreate', exited(code, 'nope', VALID));
      expect(verdict.status).toBe('blocked');
      expect(verdict.block).toBeDefined();
    }
  });

  test('exit 0 does not fail it', () => {
    expect(verdictOf('WorktreeCreate', exited(0, '', '/tmp/wt')).block).toBeUndefined();
  });
});

spec('hooks.behavior.Exit code output.WorktreeRemove', () => {
  test('any non-zero exit code fails removal only if the directory still exists afterward', () => {
    for (const code of [1, 2, 9]) {
      const verdict = verdictOf('WorktreeRemove', exited(code, 'busy'));
      expect(verdict.status).toBe('blocked');
      expect(verdict.block?.condition).toBe('worktree-directory-remains');
    }
    expect(verdictOf('WorktreeRemove', exited(0)).block).toBeUndefined();
  });
});

const json = (event: HookEvent) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: event, action: 'decline' } });

spec('hooks.behavior.Exit code output.Elicitation and ElicitationResult', () => {
  test('hookSpecificOutput is applied on exit 0', () => {
    for (const event of ['Elicitation', 'ElicitationResult'] as const) {
      expect(verdictOf(event, exited(0, '', json(event))).output).toBeDefined();
    }
  });

  test('and ignored on any other exit code', () => {
    for (const event of ['Elicitation', 'ElicitationResult'] as const) {
      expect(verdictOf(event, exited(1, 'x', json(event))).output).toBeUndefined();
      expect(verdictOf(event, exited(2, 'x', json(event))).output).toBeUndefined();
    }
  });
});
