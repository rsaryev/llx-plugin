/**
 * hooks.md § Match Monitor commands: a `PreToolUse` or `PermissionRequest` hook with a `Bash`
 * matcher also runs on shell commands the Monitor tool starts, but its `allow` and `updatedInput`
 * have no effect on them; `Bash|PowerShell`, `^Bash$` and `Bash.*` are Bash matchers too; a Bash
 * matcher does not run for a WebSocket watch, and a `PostToolUse` hook with one does not run for
 * Monitor; a matcher that includes Monitor (or none) gets the Monitor call's own input and its
 * `allow` and `updatedInput` apply; in `if`, a Bash matcher names Bash and the hook "doesn't run if
 * its `if` names Monitor"; a matcher that includes Monitor with an `if` naming Bash has no effect.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { command, entry, FACTS, select } from '../../support/hooks-select.ts';

const EVENTS = ['PreToolUse', 'PermissionRequest'] as const;
const monitorCommand = { description: 'tail', timeout_ms: 1000, command: 'tail -f app.log' };
const monitorSocket = { description: 'ws', timeout_ms: 1000, ws: { url: 'wss://x.test/feed' } };

const run = (
  event: (typeof EVENTS)[number] | 'PostToolUse',
  options: { matcher?: string; if?: string },
  input: unknown,
) => {
  const registered = entry(event, {
    ...(options.matcher === undefined ? {} : { matcher: options.matcher }),
    handler: { ...command(), ...(options.if === undefined ? {} : { if: options.if }) },
  });
  const result = select([registered], event, {
    ...FACTS[event],
    tool_name: 'Monitor',
    tool_input: input,
  });
  return { selected: result.selected.length === 1, treatment: result.monitor.get(registered) };
};

spec(['hooks.matcher.PreToolUse', 'hooks.matcher.PermissionRequest'], () => {
  test('a Bash matcher also runs on a Monitor command, as a Bash call whose effects do not apply', () => {
    for (const event of EVENTS) {
      for (const matcher of ['Bash', 'Bash|PowerShell', '^Bash$', 'Bash.*']) {
        const ran = run(event, { matcher }, monitorCommand);
        expect(ran.selected).toBe(true);
        expect(ran.treatment).toEqual({ asBash: true, effectsApply: false });
      }
    }
  });

  test('a Bash matcher does not run for a WebSocket watch', () => {
    for (const event of EVENTS) {
      expect(run(event, { matcher: 'Bash' }, monitorSocket).selected).toBe(false);
    }
  });

  test('a PostToolUse hook with a Bash matcher does not run for Monitor', () => {
    expect(run('PostToolUse', { matcher: 'Bash' }, monitorCommand).selected).toBe(false);
  });

  test('a matcher that includes Monitor, or none, gets the call itself and its effects apply', () => {
    for (const event of EVENTS) {
      for (const matcher of ['Bash|Monitor', '.*', undefined]) {
        const ran = run(event, matcher === undefined ? {} : { matcher }, monitorCommand);
        expect(ran.selected).toBe(true);
        expect(ran.treatment).toEqual({ asBash: false, effectsApply: true });
      }
    }
  });

  test('a matcher that includes Monitor also runs for a WebSocket watch', () => {
    expect(run('PreToolUse', { matcher: 'Monitor' }, monitorSocket).selected).toBe(true);
    expect(run('PreToolUse', {}, monitorSocket).selected).toBe(true);
  });

  test('with a Bash matcher, `if` names Bash: Bash(tail *) runs, Monitor(tail *) does not', () => {
    expect(
      run('PreToolUse', { matcher: 'Bash', if: 'Bash(tail *)' }, monitorCommand).selected,
    ).toBe(true);
    expect(
      run('PreToolUse', { matcher: 'Bash', if: 'Monitor(tail *)' }, monitorCommand).selected,
    ).toBe(false);
  });

  test('with a matcher that includes Monitor, `if` names Monitor: Monitor(tail *) runs and its effects apply', () => {
    const ran = run('PreToolUse', { matcher: 'Monitor', if: 'Monitor(tail *)' }, monitorCommand);
    expect(ran.selected).toBe(true);
    expect(ran.treatment?.effectsApply).toBe(true);
    expect(
      run('PreToolUse', { matcher: 'Monitor', if: 'Monitor(npm *)' }, monitorCommand).selected,
    ).toBe(false);
  });

  test('with a matcher that includes Monitor and an `if` naming Bash, the hook runs but its effects have none', () => {
    const ran = run('PreToolUse', { matcher: 'Monitor', if: 'Bash(tail *)' }, monitorCommand);
    expect(ran.selected).toBe(true);
    expect(ran.treatment).toEqual({ asBash: false, effectsApply: false });
  });
});

describe('a Monitor call outside the two events', () => {
  test('is matched by the tool name alone', () => {
    expect(run('PostToolUse', { matcher: 'Monitor' }, monitorCommand).selected).toBe(true);
    expect(run('PostToolUse', { matcher: 'Monitor' }, monitorCommand).treatment).toBeUndefined();
  });
});
