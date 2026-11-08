/**
 * hooks.md § "Hooks that start a background process": a decision a background process prints after
 * Claude Code stopped reading does not block; an allow followed by a background process that keeps
 * the hook's output open is refused. The runner reports a held-open capture as `outputHeldOpen`
 * (an optional field of its answer, docs/API.md "Ports"); the docs' `policy-check.sh` script is the
 * example, with its `|| exit $?` and its `>/dev/null 2>&1 &`.
 */
import { describe, expect, test } from 'bun:test';
import type { CommandResult } from '../../../src/ports/index.ts';
import { entry } from '../../support/hooks-select.ts';
import { engineSession } from '../../support/hooks-session.ts';
import { exited, verdictOf } from '../../support/hooks-verdict.ts';
import { spec } from '../../support/spec.ts';

/** The runner's answer with a capture a background process still holds open (see `outputHeldOpen`). */
const heldOpen = (reply: Partial<CommandResult>) =>
  Object.assign({}, reply, { outputHeldOpen: true });

const ALLOW = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
});
const hook = entry('PreToolUse', { handler: { type: 'command', command: './policy.sh' } });

/** What the runner answers when the script printed an allow and left a process holding its output. */
const allowThenBackground = heldOpen({ exitCode: 0, stdout: ALLOW });
/** The same script with the background process redirected: the capture closes with the process. */
const allowThenRedirected = { exitCode: 0, stdout: ALLOW };

spec('hooks.behavior.Hooks that start a background process', () => {
  test('an allow followed by a background process with its output not redirected blocks the tool call', async () => {
    const { fire } = engineSession([hook], [allowThenBackground]);
    const outcome = await fire('PreToolUse');
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.message).toBe(
      'PreToolUse:Bash hook error: [./policy.sh]: refusing to honor the suspect capture',
    );
    expect(outcome.effects.permissionDecision).toBe('deny');
  });

  test('with the background process redirected (>/dev/null 2>&1 &) the printed allow stands', async () => {
    const { fire } = engineSession([hook], [allowThenRedirected]);
    const outcome = await fire('PreToolUse');
    expect(outcome.proceed).toBe(true);
    expect(outcome.effects.permissionDecision).toBe('allow');
  });

  test('a deny the background process prints after Claude Code stopped reading does not block: only what the hook printed until it exited counts', async () => {
    // The runner returns at the hook's exit, so the late "deny" is never part of `stdout`.
    const { fire } = engineSession([hook], [allowThenRedirected]);
    expect((await fire('PreToolUse')).block).toBeUndefined();
  });

  test('"|| exit $?": a check that exits 2 to deny still blocks, the hook keeps its own exit code', async () => {
    const { fire } = engineSession([hook], [heldOpen({ exitCode: 2, stderr: 'denied' })]);
    const outcome = await fire('PreToolUse');
    expect(outcome.proceed).toBe(false);
    expect(outcome.block?.via).toBe('exit2');
    expect(outcome.block?.reason).toBe('denied');
  });

  test('without a report of an open capture the run is read as any other', () => {
    expect(verdictOf('PreToolUse', exited(0, '', ALLOW)).block).toBeUndefined();
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('a refused capture on an event that keeps Claude working (Stop) blocks nothing: a notice only', async () => {
    const stop = entry('Stop', { handler: { type: 'command', command: './stop.sh' } });
    const { fire } = engineSession([stop], [heldOpen({ exitCode: 0 })]);
    const outcome = await fire('Stop');
    expect(outcome.proceed).toBe(true);
    expect(outcome.notices[0]?.message).toContain('refusing to honor the suspect capture');
  });

  test('on an event that cannot block (PostToolUse) it is a non-blocking error', async () => {
    const post = entry('PostToolUse', { handler: { type: 'command', command: './post.sh' } });
    const { fire } = engineSession([post], [heldOpen({ exitCode: 0 })]);
    const outcome = await fire('PostToolUse');
    expect(outcome.proceed).toBe(true);
    expect(outcome.notices[0]?.message).toContain('suspect capture');
  });

  test('a plain run with nothing printed is refused as well: the same late write could be a deny', async () => {
    const { fire } = engineSession([hook], [heldOpen({ exitCode: 0 })]);
    expect((await fire('PreToolUse')).proceed).toBe(false);
  });
});
