/**
 * Judgment (spec/judgments.md, `HostToolNames`): plugins/mods/events.md, "Guard or change a tool
 * call", says "`e.tool` is the tool's name", in Claude Code's names. With `ModToolFlow.names`, a
 * call the host makes under its own tool name reaches `tool.call` and `tool.check` (and their
 * matchers) by the Claude Code name of that call, and the host's callbacks get its own name back.
 */
import { describe, expect, test } from 'bun:test';
import { runModToolCall } from '../../../src/mods/load/index.ts';
import { fn } from '../../support/mods-chain.ts';
import { openToolFlow } from '../../support/mods-tool-flow.ts';

const NAMES = {
  toClaude: { Search: ['Grep', 'Glob'] },
  callName: (_tool: string, input: unknown) =>
    typeof input === 'object' && input !== null && 'pattern' in input ? 'Grep' : 'Glob',
};

describe('mods tool events in the host tool names (judgment, spec/judgments.md)', () => {
  test('the hooks see the Claude Code name of the call; the host callbacks see its own', async () => {
    const seen: unknown[] = [];
    const { flow } = await openToolFlow(
      [],
      [
        fn('tool.call', (_$, e, next) => (seen.push(['call', e.tool]), next(e)), {
          matcher: { tool: 'Grep' },
        }),
        fn('tool.check', (_$, e, next) => (seen.push(['check', e.tool]), next(e))),
      ],
    );
    const ran: unknown[] = [];
    await runModToolCall({
      ...flow,
      names: NAMES,
      call: { tool: 'Search', pattern: 'TODO' },
      decide: (call) => (ran.push(['decide', call.tool]), Promise.resolve({ decision: 'allow' })),
      execute: (call) => (ran.push(['execute', call.tool]), Promise.resolve({})),
    });
    expect(seen).toEqual([
      ['call', 'Grep'],
      ['check', 'Grep'],
    ]);
    expect(ran).toEqual([
      ['decide', 'Search'],
      ['execute', 'Search'],
    ]);
  });

  test('a matcher on the other name skips the call', async () => {
    const seen: unknown[] = [];
    const { flow } = await openToolFlow(
      [],
      [
        fn('tool.call', (_$, e, next) => (seen.push(e.tool), next(e)), {
          matcher: { tool: 'Glob' },
        }),
      ],
    );
    await runModToolCall({ ...flow, names: NAMES, call: { tool: 'Search', pattern: 'x' } });
    expect(seen).toEqual([]);
  });
});
