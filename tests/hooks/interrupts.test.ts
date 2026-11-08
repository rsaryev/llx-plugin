/**
 * hooks.md § "PostToolUse after an interrupt" (Ctrl+Enter, Enter, Esc), § "`Esc` during a prompt
 * check" and § "What a blocked prompt leaves behind". The kit computes the limit a hook runs under
 * and what an interrupted check comes to; the port enforces the limit, so the proof is the limit
 * the runner receives and the outcome the host is handed.
 */
import { describe, expect, test } from 'bun:test';
import { entry } from '../support/hooks-select.ts';
import { engineSession } from '../support/hooks-session.ts';
import { spec } from '../support/spec.ts';

const afterWrite = (more: object = {}) =>
  entry('PostToolUse', { handler: { type: 'command', command: './fmt.sh', ...more } });

spec('hooks.behavior.PostToolUse after an interrupt.Ctrl+Enter', () => {
  test('the hooks run on the tool result and have 10 seconds to finish', async () => {
    const { fire, runner } = engineSession([afterWrite()], [{ exitCode: 0 }]);
    const outcome = await fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(outcome.runs).toHaveLength(1);
    expect(runner.calls[0]?.timeoutMs).toBe(10_000);
  });

  test('10 seconds is a ceiling "whatever its timeout": a shorter timeout stays, a longer one is cut', async () => {
    const short = engineSession([afterWrite({ timeout: 3 })], [{}]);
    await short.fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(short.runner.calls[0]?.timeoutMs).toBe(3000);
    const long = engineSession([afterWrite({ timeout: 120 })], [{}]);
    await long.fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(long.runner.calls[0]?.timeoutMs).toBe(10_000);
  });

  test('a command hook still running at 10 seconds is killed: the run is a timeout', async () => {
    // The runner times a process out only at the limit the kit gave it, so 10 seconds is the only
    // limit that produces a timeout here (the default is 600).
    const { fire } = engineSession(
      [afterWrite()],
      [
        (run) =>
          run.timeoutMs === 10_000
            ? { timedOut: true, exitCode: null }
            : { exitCode: 0, stdout: 'finished in time' },
      ],
    );
    const outcome = await fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(outcome.runs[0]?.status).toBe('timed-out');
  });

  test('to let a longer command hook finish, run it with async: true, which has no limit', async () => {
    const { fire, runner } = engineSession([afterWrite({ async: true })], [{}]);
    await fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(runner.calls[0]).not.toHaveProperty('timeoutMs');
  });

  test('the key acts as Esc when a ! command was queued ahead of the messages', async () => {
    const { fire, runner } = engineSession([afterWrite()], [{}]);
    const outcome = await fire('PostToolUse', {
      interrupt: { key: 'ctrl-enter', queuedShellCommand: true },
    });
    expect(runner.calls).toHaveLength(0);
    expect(outcome.runs[0]?.status).toBe('cancelled');
  });

  test('and when background tasks are disabled with CLAUDE_CODE_DISABLE_BACKGROUND_TASKS', async () => {
    const off = engineSession([afterWrite()], [{}], {
      environment: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
    });
    await off.fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(off.runner.calls).toHaveLength(0);
    const on = engineSession([afterWrite()], [{}], {
      environment: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' },
    });
    await on.fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(on.runner.calls).toHaveLength(1);
  });
});

spec('hooks.behavior.PostToolUse after an interrupt.Enter', () => {
  test('a message queued with Enter does not interrupt the turn: the hooks keep their usual timeout', async () => {
    const { fire, runner } = engineSession([afterWrite({ timeout: 120 })], [{}]);
    await fire('PostToolUse', { interrupt: { key: 'enter' } });
    expect(runner.calls[0]?.timeoutMs).toBe(120_000);
  });

  test('without a timeout of its own the hook has the default of its event', async () => {
    const { fire, runner } = engineSession([afterWrite()], [{}]);
    await fire('PostToolUse', { interrupt: { key: 'enter' } });
    expect(runner.calls[0]?.timeoutMs).toBe(600_000);
  });
});

spec('hooks.behavior.PostToolUse after an interrupt.Esc', () => {
  test('you cancel the hooks at once: none of them runs', async () => {
    const { fire, runner } = engineSession(
      [afterWrite({ command: './a.sh' }), afterWrite({ command: './b.sh' })],
      [{}, {}],
    );
    const outcome = await fire('PostToolUse', { interrupt: { key: 'esc' } });
    expect(runner.calls).toHaveLength(0);
    expect(outcome.runs.map(({ status }) => status)).toEqual(['cancelled', 'cancelled']);
    expect(outcome.proceed).toBe(true);
  });

  test('an Esc that aborts the session while a hook runs cancels it too', async () => {
    const controller = new AbortController();
    const { fire } = engineSession(
      [afterWrite()],
      [
        () => {
          controller.abort();
          return { exitCode: null };
        },
      ],
    );
    const outcome = await fire('PostToolUse', { signal: controller.signal });
    expect(outcome.runs[0]?.status).toBe('cancelled');
  });

  test('no interrupt changes nothing', async () => {
    const { fire, runner } = engineSession([afterWrite({ timeout: 120 })], [{}]);
    await fire('PostToolUse');
    expect(runner.calls[0]?.timeoutMs).toBe(120_000);
  });
});

describe('Ctrl+Enter kills a command hook only (judgment)', () => {
  test('an http hook keeps its own timeout: the docs say "kills a command hook"', async () => {
    const web = entry('PostToolUse', {
      handler: { type: 'http', url: 'https://hooks.example.com/post', timeout: 120 },
    });
    const { fire, http } = engineSession([web], [], { http: [{ status: 200, body: '' }] });
    await fire('PostToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(http.requests[0]?.timeoutMs).toBe(120_000);
  });
});

describe('an interrupt leaves the hooks of other events alone (judgment)', () => {
  test('PreToolUse hooks keep their limit under Ctrl+Enter', async () => {
    const { fire, runner } = engineSession(
      [entry('PreToolUse', { handler: { type: 'command', command: './g.sh', timeout: 120 } })],
      [{}],
    );
    await fire('PreToolUse', { interrupt: { key: 'ctrl-enter' } });
    expect(runner.calls[0]?.timeoutMs).toBe(120_000);
  });
});

const check = (script = './check.sh') =>
  entry('UserPromptSubmit', { handler: { type: 'command', command: script } });
const submitted = { facts: { prompt: 'deploy the secret' } };

spec('hooks.behavior.Esc during a prompt check', () => {
  test('the check stops, the prompt does not reach Claude and the text returns to the input', async () => {
    const controller = new AbortController();
    const { fire } = engineSession(
      [check()],
      [
        () => {
          controller.abort();
          return { exitCode: null };
        },
      ],
    );
    const outcome = await fire('UserPromptSubmit', { ...submitted, signal: controller.signal });
    expect(outcome.proceed).toBe(false);
    expect(outcome.interrupted).toEqual({ restoreInput: true });
    expect(outcome.block).toBeUndefined();
  });

  test('a hook that blocks the prompt at the same moment keeps it blocked: its message shows, the text does not return', async () => {
    const controller = new AbortController();
    const { fire } = engineSession(
      [check('./a.sh'), check('./b.sh')],
      [
        { exitCode: 2, stderr: 'no secrets' },
        () => {
          controller.abort();
          return { exitCode: null };
        },
      ],
    );
    const outcome = await fire('UserPromptSubmit', { ...submitted, signal: controller.signal });
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.reason).toBe('no secrets');
    expect(outcome.interrupted).toEqual({ restoreInput: false });
  });

  test('hooks that all finished before the interrupt are not an interrupted check', async () => {
    const controller = new AbortController();
    const { fire } = engineSession([check()], [{ exitCode: 0 }]);
    const outcome = await fire('UserPromptSubmit', { ...submitted, signal: controller.signal });
    controller.abort();
    expect(outcome.proceed).toBe(true);
    expect(outcome.interrupted).toBeUndefined();
  });

  test('nothing carries over after an interrupted check: the resent prompt is judged afresh on the same engine', async () => {
    const controller = new AbortController();
    const { fire } = engineSession(
      [check()],
      [
        () => {
          controller.abort();
          return { exitCode: null };
        },
        { exitCode: 2, stderr: 'again' },
      ],
    );
    const first = await fire('UserPromptSubmit', { ...submitted, signal: controller.signal });
    expect(first.interrupted).toEqual({ restoreInput: true });
    const resent = await fire('UserPromptSubmit', submitted);
    expect(resent.block?.reason).toBe('again');
    expect(resent.interrupted).toBeUndefined();
  });
});

const quoted = (outcome: { block?: { message: string } | undefined }) => outcome.block?.message;
const suppress = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: true },
});

spec('hooks.behavior.What a blocked prompt leaves behind', () => {
  test('by default the block message shown to the user ends with "Original prompt:" and the submitted text', async () => {
    const { fire } = engineSession([check()], [{ exitCode: 2, stderr: 'no secrets' }]);
    const outcome = await fire('UserPromptSubmit', submitted);
    expect(outcome.block?.to).toBe('user');
    expect(quoted(outcome)).toMatch(/Original prompt: deploy the secret$/);
    expect(quoted(outcome)).toContain('no secrets');
  });

  test('a hook that blocks with decision "block" leaves it behind the same way', async () => {
    const json = JSON.stringify({ decision: 'block', reason: 'not now' });
    const { fire } = engineSession([check()], [{ stdout: json }]);
    const outcome = await fire('UserPromptSubmit', submitted);
    expect(quoted(outcome)).toMatch(/^not now\nOriginal prompt: deploy the secret$/);
  });

  test('suppressOriginalPrompt leaves the text out, for a decision block', async () => {
    const json = JSON.stringify({
      decision: 'block',
      reason: 'not now',
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: true },
    });
    const { fire } = engineSession([check()], [{ stdout: json }]);
    const outcome = await fire('UserPromptSubmit', submitted);
    expect(quoted(outcome)).toBe('not now');
  });

  test('and for a hook that blocks by exiting 2', async () => {
    const { fire } = engineSession(
      [check()],
      [{ exitCode: 2, stderr: 'no secrets', stdout: suppress }],
    );
    const outcome = await fire('UserPromptSubmit', submitted);
    expect(outcome.block?.message).not.toContain('Original prompt');
    expect(outcome.block?.message).not.toContain('deploy the secret');
    expect(outcome.block?.reason).toBe('no secrets');
  });

  test('suppressOriginalPrompt: false keeps it', async () => {
    const off = JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: false },
    });
    const { fire } = engineSession([check()], [{ exitCode: 2, stderr: 'x', stdout: off }]);
    expect(quoted(await fire('UserPromptSubmit', submitted))).toContain('Original prompt:');
  });

  test('the prompt of a block that is not a prompt block is not quoted: PreToolUse', async () => {
    const { fire } = engineSession(
      [entry('PreToolUse', { handler: { type: 'command', command: './g.sh' } })],
      [{ exitCode: 2, stderr: 'no' }],
    );
    expect(quoted(await fire('PreToolUse'))).not.toContain('Original prompt');
  });

  test('a prompt that is not blocked has no message to end', async () => {
    const { fire } = engineSession([check()], [{ exitCode: 0 }]);
    expect((await fire('UserPromptSubmit', submitted)).block).toBeUndefined();
  });
});
