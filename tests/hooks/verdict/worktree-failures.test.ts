/**
 * Judgment (spec/judgments.md, `src/hooks/verdict/interpret.ts`): hooks.md § "HTTP response
 * handling" gives `WorktreeCreate` "its own failure contract" and § "MCP tool hook fields" says an
 * `isError: true` result "produces a non-blocking error". Where the two meet, the kit lets the
 * event's contract win: a failed `mcp_tool` hook fails the worktree, as a failed `http` hook does.
 * Outside `spec(...)`: a judgment never counts as compatibility.
 */
import { expect, test } from 'bun:test';
import type { HookHandler } from '../../../src/protocol/hook-config.ts';
import { verdictOf } from '../../support/hooks-verdict.ts';

const tool: HookHandler = { type: 'mcp_tool', server: 'wt', tool: 'make' };

test('an mcp_tool hook that answers isError fails WorktreeCreate and WorktreeRemove', () => {
  for (const event of ['WorktreeCreate', 'WorktreeRemove'] as const) {
    const verdict = verdictOf(
      event,
      { kind: 'mcp', isError: true, text: 'no space' },
      { hook: tool },
    );
    expect(verdict.status).toBe('blocked');
    expect(verdict.block?.via).toBe('failure');
    expect(verdict.block?.debug).toContain('no space');
  }
});

test('on an event that can be blocked it is a non-blocking error', () => {
  const verdict = verdictOf(
    'PreToolUse',
    { kind: 'mcp', isError: true, text: 'boom' },
    { hook: tool },
  );
  expect(verdict.block).toBeUndefined();
  expect(verdict.status).toBe('non-blocking-error');
});
