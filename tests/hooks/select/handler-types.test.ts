/**
 * hooks.md § Common fields (`type`: "command", "http", "mcp_tool", "prompt", or "agent") and
 * § Prompt-based hooks ("Not all events support every hook type"; `PermissionRequest`: "If you
 * configure an agent hook on this event, Claude Code skips it and the permission flow proceeds
 * unchanged"). The per-event table is proven under each `hooks.event.<Event>`; here the five types
 * are shown to be the ones a registry can hold and to be told apart when an event skips one.
 */
import { describe, expect, test } from 'bun:test';
import { eventsSupporting, supportsHandlerType } from '../../../src/hooks/select/event-catalog.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import { HOOK_HANDLER_TYPES } from '../../../src/protocol/hook-config.ts';
import { spec } from '../../support/spec.ts';
import { entry, FACTS, HANDLERS, select } from '../../support/hooks-select.ts';

spec('hooks.handler.common.type', () => {
  test('the five types are command, http, mcp_tool, prompt and agent', () => {
    expect([...HOOK_HANDLER_TYPES]).toEqual(['command', 'http', 'mcp_tool', 'prompt', 'agent']);
  });

  test('each type runs on PreToolUse, where all five are supported', () => {
    for (const type of HOOK_HANDLER_TYPES) {
      const registered = entry('PreToolUse', { handler: HANDLERS[type] });
      expect(select([registered], 'PreToolUse', FACTS.PreToolUse).selected).toEqual([registered]);
    }
  });

  test('an agent hook on PermissionRequest is skipped and the others still run', () => {
    const agent = entry('PermissionRequest', { handler: HANDLERS.agent });
    const prompt = entry('PermissionRequest', { handler: HANDLERS.prompt });
    const result = select([agent, prompt], 'PermissionRequest', FACTS.PermissionRequest);
    expect(result.selected).toEqual([prompt]);
  });

  test('prompt and agent hooks are skipped on an event that supports only command, http and mcp_tool', () => {
    for (const type of ['prompt', 'agent'] as const) {
      const registered = entry('Notification', { handler: HANDLERS[type] });
      expect(select([registered], 'Notification', FACTS.Notification).selected).toEqual([]);
    }
  });

  test('SessionStart and Setup run only command and mcp_tool hooks', () => {
    for (const event of ['SessionStart', 'Setup'] as const) {
      const ran = HOOK_HANDLER_TYPES.filter((type) => supportsHandlerType(event, type));
      expect(ran).toEqual(['command', 'mcp_tool']);
    }
  });
});

describe('judgment: a handler type the event does not support is reported', () => {
  test('a warning at hooks.<Event>[i] names the type and the event, and the handler is skipped', () => {
    const command = entry('SessionStart');
    const http = entry('SessionStart', { handler: HANDLERS.http });
    const result = select([command, http], 'SessionStart', FACTS.SessionStart);
    expect(result.selected).toEqual([command]);
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: 'hooks.SessionStart[1]',
        message: 'A http hook is not supported on SessionStart and is skipped',
      },
    ]);
  });

  test('the support table lists every event for the type that all of them run', () => {
    expect(eventsSupporting('command')).toEqual([...HOOK_EVENTS]);
  });
});
