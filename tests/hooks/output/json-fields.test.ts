/**
 * The universal JSON fields: hooks.md § "JSON output" (the field table, "To stop Claude entirely",
 * "Every event accepts them, but some events discard them") and each event's section for what it
 * discards. `hooks.output.common.*` and `hooks.output.JSON.*` name the same five fields, so each
 * is proven once and cited under both. The moment Claude Code stops, shows or emits is the host's:
 * what the kit proves is what it hands the host after the merge, per event.
 */
import { describe, expect, test } from 'bun:test';
import { OUTPUT_CAPS, parseHookOutput } from '../../../src/hooks/index.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import { merged, specific } from '../../support/hooks-output.ts';
import { spec } from '../../support/spec.ts';

/** The events whose sections say they discard `continue` (hooks.md, one quote per section). */
const DISCARDS_CONTINUE: readonly HookEvent[] = [
  'Setup', // "On every exit code, Claude Code discards a Setup hook's JSON output fields, such as systemMessage, continue"
  'InstructionsLoaded', // "Claude Code discards their JSON output fields, such as systemMessage and continue"
  'MessageDisplay', // "discards systemMessage and continue"
  'Notification', // "discards their systemMessage and continue fields"
  'PreCompact', // "Claude Code discards a PreCompact hook's systemMessage and continue fields"
  'PostCompact', // "discards a PostCompact hook's systemMessage and continue fields"
  'ConfigChange', // "discards systemMessage and continue"
  'CwdChanged', // "reads watchPaths and systemMessage ... and discards continue"
  'FileChanged', // same
  'DirectoryAdded', // "discards the continue field from their JSON output"
  'WorktreeCreate', // "discards systemMessage and continue"
  'WorktreeRemove', // "discards a WorktreeRemove hook's JSON output fields, such as systemMessage and continue"
  'SessionEnd', // "discards their JSON output fields, such as systemMessage"
  'Elicitation', // "discards reason, systemMessage, and continue"
  'ElicitationResult',
  'TaskCreated', // "Claude Code ignores continue: false from this event"
  'StopFailure', // "run for notification and logging purposes only"
  'PermissionDenied', // "The only output this event reads is hookSpecificOutput.retry"
];

const DISCARDS_SYSTEM_MESSAGE: readonly HookEvent[] = [
  'Setup',
  'InstructionsLoaded',
  'MessageDisplay',
  'Notification',
  'PreCompact',
  'PostCompact',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'SessionEnd',
  'Elicitation',
  'ElicitationResult',
  'StopFailure',
  'PermissionDenied',
];

const honouring = (discarding: readonly HookEvent[]) =>
  HOOK_EVENTS.filter((event) => !discarding.includes(event));

spec(['hooks.output.common.continue', 'hooks.output.JSON.continue'], () => {
  test('{"continue": false, "stopReason": ...} stops processing and carries the reason', () => {
    const outcome = merged('PostToolUse', [
      { continue: false, stopReason: 'Build failed, fix errors before continuing' },
    ]);
    expect(outcome.continue).toBe(false);
    expect(outcome.stopReason).toBe('Build failed, fix errors before continuing');
  });

  test('the default is true: no field, true, or no output at all lets processing go on', () => {
    expect(merged('PostToolUse', [{}]).continue).toBe(true);
    expect(merged('PostToolUse', [{ continue: true }]).continue).toBe(true);
    expect(merged('PostToolUse', []).continue).toBe(true);
  });

  test('one hook that stops is enough, whatever the others say', () => {
    expect(merged('PreToolUse', [{ continue: true }, { continue: false }]).continue).toBe(false);
  });

  test('it takes precedence over event-specific decisions: a Stop hook that blocks the stop and stops, stops', () => {
    const outcome = merged('Stop', [{ continue: false, decision: 'block', reason: 'keep going' }]);
    expect(outcome.continue).toBe(false);
    expect(outcome.block).toBeUndefined();
  });

  test('"For PreToolUse and PostToolUse hooks, the stop applies even when the tool call fails"', () => {
    for (const event of ['PreToolUse', 'PostToolUse'] as const) {
      expect(OUTPUT_CAPS[event].accepts.has('continue')).toBe(true);
    }
    const failed = merged('PostToolUse', [{ continue: false }], {
      tool_name: 'Bash',
      tool_input: {},
      tool_response: { error: 'exit 1' },
      tool_use_id: 't1',
    });
    expect(failed.continue).toBe(false);
  });

  test('a PostToolBatch stop also holds the loop back, like decision: block', () => {
    const outcome = merged('PostToolBatch', [{ continue: false, stopReason: 'budget spent' }]);
    expect(outcome.block).toMatchObject({ via: 'continue-false', reason: 'budget spent' });
  });

  test.each(DISCARDS_CONTINUE)('%s discards it', (event) => {
    const outcome = merged(event, [{ continue: false, stopReason: 'x' }]);
    expect(outcome.continue).toBe(true);
    expect(outcome.stopReason).toBeUndefined();
  });

  test.each(honouring(DISCARDS_CONTINUE))('%s honours it', (event) => {
    expect(merged(event, [{ continue: false }]).continue).toBe(false);
  });

  test('a value that is not a boolean fails validation', () => {
    expect(parseHookOutput('Stop', { continue: 'no' }).failure).toContain('continue');
  });
});

spec(['hooks.output.common.stopReason', 'hooks.output.JSON.stopReason'], () => {
  test('is the message for the user when continue is false, the first stopping hook gives it', () => {
    const outcome = merged('Stop', [
      { continue: true, stopReason: 'ignored: this hook does not stop' },
      { continue: false, stopReason: 'first stop' },
      { continue: false, stopReason: 'second stop' },
    ]);
    expect(outcome.stopReason).toBe('first stop');
  });

  test('is not surfaced while continue is true', () => {
    expect(merged('Stop', [{ stopReason: 'unused' }]).stopReason).toBeUndefined();
  });

  test('a wrong type fails validation', () => {
    expect(parseHookOutput('Stop', { continue: false, stopReason: 3 }).failure).toContain(
      'stopReason',
    );
  });
});

spec(['hooks.output.common.suppressOutput', 'hooks.output.JSON.suppressOutput'], () => {
  test('is accepted and has no effect: the merge is the same with and without it', () => {
    for (const event of ['PreToolUse', 'PostToolUse', 'Notification', 'SessionStart'] as const) {
      const without = merged(event, [{ systemMessage: 'hi' }]);
      expect(parseHookOutput(event, { suppressOutput: true }).failure).toBeUndefined();
      expect(merged(event, [{ systemMessage: 'hi', suppressOutput: true }])).toEqual(without);
      expect(merged(event, [{ suppressOutput: true }])).toEqual(merged(event, [{}]));
    }
  });

  test('a wrong type fails validation', () => {
    expect(parseHookOutput('Stop', { suppressOutput: 'yes' }).failure).toContain('suppressOutput');
  });
});

spec(['hooks.output.common.systemMessage', 'hooks.output.JSON.systemMessage'], () => {
  test('every hook warning reaches the user, in registry order', () => {
    const outcome = merged('PostToolUse', [
      { systemMessage: 'first' },
      {},
      { systemMessage: '' },
      { systemMessage: 'third' },
    ]);
    expect(outcome.systemMessages).toEqual(['first', 'third']);
  });

  test.each(DISCARDS_SYSTEM_MESSAGE)('%s discards it', (event) => {
    expect(merged(event, [{ systemMessage: 'warn' }]).systemMessages).toEqual([]);
  });

  // DirectoryAdded keeps it but routes it by source (session-events.test.ts).
  const keepers = honouring(DISCARDS_SYSTEM_MESSAGE).filter((event) => event !== 'DirectoryAdded');
  test.each(keepers)('%s keeps it', (event) => {
    expect(merged(event, [{ systemMessage: 'warn' }]).systemMessages).toEqual(['warn']);
  });

  test('PreModelSwitch shows it whatever the decision', () => {
    for (const decision of ['allow', 'deny', 'ask'] as const) {
      const outcome = merged('PreModelSwitch', [
        {
          systemMessage: 'costs 180k tokens',
          ...specific('PreModelSwitch', { permissionDecision: decision }),
        },
      ]);
      expect(outcome.systemMessages).toEqual(['costs 180k tokens']);
    }
  });

  test('a wrong type fails validation', () => {
    expect(parseHookOutput('Stop', { systemMessage: ['a'] }).failure).toContain('systemMessage');
  });
});

describe('the cap table', () => {
  test('has a row for every event, and each field is accepted or discarded, never both', () => {
    for (const event of HOOK_EVENTS) {
      const { accepts, discards } = OUTPUT_CAPS[event];
      expect([...accepts].filter((field) => discards.has(field))).toEqual([]);
      expect(accepts.size + discards.size).toBe(5);
    }
  });

  test('Notification discards systemMessage and continue but keeps terminalSequence', () => {
    const outcome = merged('Notification', [
      { systemMessage: 'warn', continue: false, terminalSequence: '\u0007' },
    ]);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.continue).toBe(true);
    expect(outcome.terminalSequences).toEqual(['\u0007']);
  });

  test('StopFailure ignores everything but terminalSequence', () => {
    const outcome = merged('StopFailure', [
      {
        systemMessage: 'warn',
        continue: false,
        decision: 'block',
        reason: 'r',
        terminalSequence: '\u0007',
      },
    ]);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.continue).toBe(true);
    expect(outcome.block).toBeUndefined();
    expect(outcome.terminalSequences).toEqual(['\u0007']);
  });

  test('Setup discards systemMessage, continue and additionalContext', () => {
    const outcome = merged('Setup', [
      {
        systemMessage: 'warn',
        continue: false,
        ...specific('Setup', { additionalContext: 'ctx' }),
      },
    ]);
    expect(outcome.systemMessages).toEqual([]);
    expect(outcome.continue).toBe(true);
    expect(outcome.additionalContext).toEqual([]);
  });

  test('a hookSpecificOutput names the event it is for: another event name fails validation', () => {
    const failure = parseHookOutput('PostToolUse', specific('PreToolUse', {})).failure;
    expect(failure).toContain('hookSpecificOutput.hookEventName');
  });

  test('a key no schema names is dropped, not a failure (judgment)', () => {
    const parsed = parseHookOutput('Stop', { futureField: 1, systemMessage: 'hi' });
    expect(parsed.failure).toBeUndefined();
    expect(parsed.output).toEqual({ systemMessage: 'hi' });
  });
});
