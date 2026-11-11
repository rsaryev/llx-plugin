/**
 * A tool the host has and Claude Code does not (a browser, a host's own search): `decide` reads it as
 * it reads an MCP tool, so no rule names it means the mode's prompt (`default-prompt`, or the mode's
 * own answer), never a deny of its own; a rule naming it decides it; `availableTools` keeps it.
 * Integration tests of the public surface, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { decide } from '../../src/index.ts';
import { availableTools } from '../../src/entry/rules.ts';
import { baseContext, rulesOf } from '../support/decide.ts';

const HOST_TOOL = 'llx_browser';
const MODES = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'] as const;
const call = (toolName: string) => ({ toolName, input: { url: 'https://example.com' } });

describe('a host-only tool', () => {
  test('decides in every mode as an MCP tool does: no verdict of its own', () => {
    for (const mode of MODES) {
      const context = baseContext(mode, { bypassAvailable: true });
      expect(decide(call(HOST_TOOL), context)).toEqual(decide(call('mcp__host__browse'), context));
    }
    expect(decide(call(HOST_TOOL), baseContext('default'))).toEqual({
      outcome: 'ask',
      reason: 'default-prompt',
    });
  });

  test('a rule naming it decides it; a rule for another tool does not touch it', () => {
    const allowed = baseContext('default', { rules: rulesOf(['allow', HOST_TOOL]) });
    expect(decide(call(HOST_TOOL), allowed).outcome).toBe('allow');
    const denied = baseContext('default', { rules: rulesOf(['deny', 'Bash']) });
    expect(decide(call(HOST_TOOL), denied).reason).toBe('default-prompt');
  });

  test('availableTools keeps it unless a rule removes it by name', () => {
    expect(availableTools([HOST_TOOL, 'Bash'], { platform: 'posix', rules: [] })).toEqual([
      HOST_TOOL,
      'Bash',
    ]);
    const rules = rulesOf(['deny', HOST_TOOL]);
    expect(availableTools([HOST_TOOL, 'Bash'], { platform: 'posix', rules })).toEqual(['Bash']);
  });
});
