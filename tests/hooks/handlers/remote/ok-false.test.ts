/**
 * What `ok: false` does on each event: hooks.md § "Response schema" ("What happens on `ok: false`
 * depends on the event") and § "Agent hook configuration" ("On `ok: false`, Claude Code handles an
 * agent hook the way it handles a prompt hook with `continueOnBlock: true` on the same event ...
 * and don't support the prompt-hook `impossible` field"). No requirement id names the mapping, so
 * the tests sit outside `spec(...)`; the one-line summary of each bullet is quoted.
 */
import { describe, expect, test } from 'bun:test';
import { eventsSupporting } from '../../../../src/hooks/select/event-catalog.ts';
import {
  OK_FALSE_RULES,
  isPromptEvent,
  okFalseEffect,
  type OkFalseEffect,
  type PromptEvent,
} from '../../../../src/hooks/handlers/remote/ok-false.ts';
import type { ModelRun } from '../../../../src/hooks/handlers/remote/types.ts';
import { HOOK_EVENTS } from '../../../../src/protocol/hook-events.ts';
import { spec } from '../../../support/spec.ts';

const no: ModelRun = { kind: 'model', ok: false, reason: 'tests fail' };
const impossible: ModelRun = { ...no, impossible: true };

const prompt = (event: PromptEvent, run: ModelRun, continueOnBlock?: boolean, teammate = false) =>
  okFalseEffect(event, run, {
    agent: false,
    ...(continueOnBlock === undefined ? {} : { continueOnBlock }),
    teammateStopped: teammate,
  });
const agent = (event: PromptEvent, run: ModelRun, teammate = false) =>
  okFalseEffect(event, run, { agent: true, teammateStopped: teammate });

const block = (
  delivery: 'claude-instruction' | 'claude-tool-error' | 'user-warning' | 'teammate',
  endsTurn: boolean,
  deniesTool = false,
): OkFalseEffect => ({ kind: 'block', reason: 'tests fail', endsTurn, delivery, deniesTool });

describe('the events that run a prompt or agent hook', () => {
  test('are exactly the events the catalog says support prompt hooks', () => {
    expect(Object.keys(OK_FALSE_RULES).toSorted()).toEqual(eventsSupporting('prompt').toSorted());
    for (const event of HOOK_EVENTS) {
      expect(isPromptEvent(event)).toBe(eventsSupporting('prompt').includes(event));
    }
  });
});

describe('ok: true', () => {
  test('has no effect on any event', () => {
    for (const event of HOOK_EVENTS.filter(isPromptEvent)) {
      expect(prompt(event, { kind: 'model', ok: true })).toEqual({ kind: 'none' });
    }
  });
});

describe('Stop and SubagentStop', () => {
  test('the reason is fed back to Claude as its next instruction and the turn continues', () => {
    for (const event of ['Stop', 'SubagentStop'] as const) {
      expect(prompt(event, no)).toEqual(block('claude-instruction', false));
    }
  });

  test('impossible: true allows the stop and the turn ends', () => {
    for (const event of ['Stop', 'SubagentStop'] as const) {
      expect(prompt(event, impossible)).toEqual({ kind: 'allow-stop' });
    }
  });

  test('an agent hook ignores impossible', () => {
    expect(agent('Stop', impossible)).toEqual(block('claude-instruction', false));
  });
});

spec(['hooks.behavior.Prompt hook configuration.continueOnBlock'], () => {
  describe('PreToolUse', () => {
    test('the tool call is denied and by default the turn ends with a warning line', () => {
      expect(prompt('PreToolUse', no)).toEqual(block('user-warning', true, true));
      expect(prompt('PreToolUse', no, false)).toEqual(block('user-warning', true, true));
    });

    test('continueOnBlock returns the reason to Claude as the tool error so it can adjust', () => {
      expect(prompt('PreToolUse', no, true)).toEqual(block('claude-tool-error', false, true));
    });

    test('an agent hook acts as if continueOnBlock were set', () => {
      expect(agent('PreToolUse', no)).toEqual(block('claude-tool-error', false, true));
    });
  });
});

describe('PostToolUse', () => {
  test('by default the turn ends and the reason is a warning line', () => {
    expect(prompt('PostToolUse', no)).toEqual(block('user-warning', true));
  });

  test('continueOnBlock feeds the reason back to Claude and the turn continues', () => {
    expect(prompt('PostToolUse', no, true)).toEqual(block('claude-instruction', false));
    expect(agent('PostToolUse', no)).toEqual(block('claude-instruction', false));
  });
});

describe('PostToolBatch, UserPromptSubmit and UserPromptExpansion', () => {
  test('the turn ends and the reason is a warning line, whatever continueOnBlock says', () => {
    for (const event of ['PostToolBatch', 'UserPromptSubmit', 'UserPromptExpansion'] as const) {
      expect(prompt(event, no)).toEqual(block('user-warning', true));
      expect(prompt(event, no, true)).toEqual(block('user-warning', true));
      expect(agent(event, no)).toEqual(block('user-warning', true));
    }
  });
});

describe('PostToolUseFailure and TaskCreated', () => {
  test('the reason is a tool error and the turn continues, regardless of continueOnBlock', () => {
    for (const event of ['PostToolUseFailure', 'TaskCreated'] as const) {
      expect(prompt(event, no)).toEqual(block('claude-tool-error', false));
      expect(prompt(event, no, false)).toEqual(block('claude-tool-error', false));
      expect(agent(event, no)).toEqual(block('claude-tool-error', false));
    }
  });
});

describe('TaskCompleted', () => {
  test('a task marked completed during a turn: a tool error, the turn continues, regardless', () => {
    expect(prompt('TaskCompleted', no)).toEqual(block('claude-tool-error', false));
    expect(prompt('TaskCompleted', no, false)).toEqual(block('claude-tool-error', false));
  });

  test('a teammate stopping fired it: it behaves like TeammateIdle', () => {
    expect(prompt('TaskCompleted', no, undefined, true)).toEqual(block('user-warning', true));
    expect(prompt('TaskCompleted', no, true, true)).toEqual(block('teammate', false));
    expect(agent('TaskCompleted', no, true)).toEqual(block('teammate', false));
  });
});

describe('TeammateIdle', () => {
  test('by default the teammate stops and the reason is a warning line', () => {
    expect(prompt('TeammateIdle', no)).toEqual(block('user-warning', true));
  });

  test('continueOnBlock feeds the reason to the teammate and keeps it working', () => {
    expect(prompt('TeammateIdle', no, true)).toEqual(block('teammate', false));
    expect(agent('TeammateIdle', no)).toEqual(block('teammate', false));
  });
});

describe('PermissionRequest and PermissionDenied', () => {
  test('ok: false has no effect', () => {
    for (const event of ['PermissionRequest', 'PermissionDenied'] as const) {
      expect(prompt(event, no)).toEqual({ kind: 'none' });
      expect(prompt(event, no, true)).toEqual({ kind: 'none' });
    }
  });
});
