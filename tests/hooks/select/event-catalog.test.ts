/**
 * hooks.md § Hook lifecycle (the cadences, the table of when each event fires, `EndConversation`
 * skipping both tool events) and § Prompt-based hooks (which events support which handler types).
 * One `spec(hooks.event.<Event>)` per event: a handler registered for the event is selected when the
 * event fires and is never selected by another event, and the event runs exactly the handler types
 * the docs list for it. Matchers are proven in matcher.test.ts, `if` in if-guard.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { EVENT_CATALOG, eventsSupporting } from '../../../src/hooks/select/event-catalog.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import { HOOK_HANDLER_TYPES, type HookHandlerType } from '../../../src/protocol/hook-config.ts';
import type { HookEvent } from '../../../src/protocol/official.ts';
import { spec } from '../../support/spec.ts';
import { entry, FACTS, HANDLERS, select } from '../../support/hooks-select.ts';

/** "Events that support all five hook types", as the docs list them. */
const ALL_FIVE: readonly HookEvent[] = [
  'PermissionDenied',
  'PostToolBatch',
  'PostToolUse',
  'PostToolUseFailure',
  'PreToolUse',
  'Stop',
  'SubagentStop',
  'TaskCompleted',
  'TaskCreated',
  'TeammateIdle',
  'UserPromptExpansion',
  'UserPromptSubmit',
];
/** "Events that support command, http, and mcp_tool hooks but not prompt or agent". */
const COMMAND_HTTP_MCP: readonly HookEvent[] = [
  'ConfigChange',
  'CwdChanged',
  'DirectoryAdded',
  'Elicitation',
  'ElicitationResult',
  'FileChanged',
  'InstructionsLoaded',
  'MessageDisplay',
  'Notification',
  'PostCompact',
  'PostModelSwitch',
  'PreCompact',
  'PreModelSwitch',
  'SessionEnd',
  'StopFailure',
  'SubagentStart',
  'WorktreeCreate',
  'WorktreeRemove',
];

/** The handler types the docs say `event` supports. */
function documentedTypes(event: HookEvent): readonly HookHandlerType[] {
  if (ALL_FIVE.includes(event)) return HOOK_HANDLER_TYPES;
  if (event === 'PermissionRequest') return ['command', 'http', 'mcp_tool', 'prompt'];
  if (COMMAND_HTTP_MCP.includes(event)) return ['command', 'http', 'mcp_tool'];
  return ['command', 'mcp_tool']; // SessionStart and Setup
}

/** The events whose `mcp_tool` hooks are skipped at launch (sample facts: `SessionStart` is a startup). */
const NO_MCP_AT_LAUNCH: readonly HookEvent[] = ['SessionStart', 'Setup'];
const MCP_TOOL: readonly HookHandlerType[] = ['mcp_tool'];

/** What an event runs when it fires with the sample facts, which are at launch. */
const typesRunAtLaunch = (event: HookEvent): readonly HookHandlerType[] =>
  NO_MCP_AT_LAUNCH.includes(event)
    ? documentedTypes(event).filter((type) => !MCP_TOOL.includes(type))
    : documentedTypes(event);

/** One handler of every type under `event`, each with its own id. */
const onePerType = (event: HookEvent) =>
  HOOK_HANDLER_TYPES.map((type) => ({
    type,
    registered: entry(event, { handler: HANDLERS[type] }),
  }));

for (const event of HOOK_EVENTS) {
  spec(`hooks.event.${event}`, () => {
    test('a handler registered for the event runs when it fires', () => {
      const registered = entry(event);
      expect(select([registered], event, FACTS[event]).selected).toEqual([registered]);
    });

    test('the handlers of other events do not run', () => {
      const others = HOOK_EVENTS.filter((other) => other !== event).map((other) => entry(other));
      expect(select(others, event, FACTS[event]).selected).toEqual([]);
    });

    test('runs exactly the handler types the docs list for it, and skips the rest', () => {
      const all = onePerType(event);
      const result = select(
        all.map((each) => each.registered),
        event,
        FACTS[event],
      );
      const ran = all.filter((each) => result.selected.includes(each.registered));
      expect(ran.map((each) => each.type)).toEqual([...typesRunAtLaunch(event)]);
      expect(result.issues).toHaveLength(HOOK_HANDLER_TYPES.length - ran.length);
    });
  });
}

const cadenceOf = (cadence: string) =>
  HOOK_EVENTS.filter((event) => EVENT_CATALOG[event].cadence === cadence);

describe('the three cadences', () => {
  test('per session: SessionStart and SessionEnd; per turn: UserPromptSubmit, Stop, StopFailure; per tool call: PreToolUse and PostToolUse', () => {
    expect(cadenceOf('session')).toEqual(['SessionStart', 'SessionEnd']);
    expect(cadenceOf('turn')).toEqual(['UserPromptSubmit', 'Stop', 'StopFailure']);
    expect(cadenceOf('tool-call')).toEqual(['PreToolUse', 'PostToolUse']);
  });
});

spec(['hooks.event.PreToolUse', 'hooks.event.PostToolUse'], () => {
  test('EndConversation calls skip both events', () => {
    for (const event of ['PreToolUse', 'PostToolUse'] as const) {
      const registered = entry(event);
      const facts = { ...FACTS[event], tool_name: 'EndConversation' };
      expect(select([registered], event, facts).selected).toEqual([]);
    }
  });

  test('another tool call fires them', () => {
    const registered = entry('PreToolUse');
    const facts = { ...FACTS.PreToolUse, tool_name: 'Bash' };
    expect(select([registered], 'PreToolUse', facts).selected).toEqual([registered]);
  });
});

const mcpHandler = (event: HookEvent) => entry(event, { handler: HANDLERS.mcp_tool });

spec(['hooks.event.SessionStart', 'hooks.event.Setup'], () => {
  test('an mcp_tool hook on Setup is always skipped, for either trigger, and the skip is reported', () => {
    for (const trigger of ['init', 'maintenance'] as const) {
      const registered = mcpHandler('Setup');
      const result = select([registered], 'Setup', { trigger });
      expect(result.selected).toEqual([]);
      expect(result.issues).toEqual([
        {
          severity: 'warning',
          path: 'hooks.Setup[0]',
          message:
            "mcp_tool hooks are not available for the 'Setup' hook event (no MCP client context) and are skipped",
        },
      ]);
    }
  });

  test('an mcp_tool hook on SessionStart is skipped at launch, with --continue, --resume or a fork', () => {
    for (const source of ['startup', 'resume', 'fork'] as const) {
      const registered = mcpHandler('SessionStart');
      const result = select([registered], 'SessionStart', { source });
      expect(result.selected).toEqual([]);
      expect(result.issues).toHaveLength(1);
    }
  });

  test('an mcp_tool hook on SessionStart runs after /clear or a compaction', () => {
    for (const source of ['clear', 'compact'] as const) {
      const registered = mcpHandler('SessionStart');
      const result = select([registered], 'SessionStart', { source });
      expect(result.selected).toEqual([registered]);
      expect(result.issues).toEqual([]);
    }
  });

  test('a command hook beside the skipped mcp_tool hook still runs at launch', () => {
    const skipped = mcpHandler('SessionStart');
    const kept = entry('SessionStart');
    const result = select([skipped, kept], 'SessionStart', FACTS.SessionStart);
    expect(result.selected).toEqual([kept]);
  });

  test('an mcp_tool hook on another event is not affected', () => {
    const registered = mcpHandler('SessionEnd');
    expect(select([registered], 'SessionEnd', FACTS.SessionEnd).selected).toEqual([registered]);
  });
});

describe('handler-type support table', () => {
  test('every handler type is supported by at least one event', () => {
    for (const type of HOOK_HANDLER_TYPES) expect(eventsSupporting(type).length).toBeGreaterThan(0);
  });

  test('only command and mcp_tool run on SessionStart and Setup; agent never runs on PermissionRequest', () => {
    expect(eventsSupporting('http')).not.toContain('SessionStart');
    expect(eventsSupporting('http')).not.toContain('Setup');
    expect(eventsSupporting('prompt')).not.toContain('Setup');
    expect(eventsSupporting('agent')).not.toContain('PermissionRequest');
  });
});
