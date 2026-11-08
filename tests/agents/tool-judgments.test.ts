/**
 * Judgments of the tools resolution (spec/judgments.md): behaviour the docs leave open. Nothing here
 * is under spec(), so none of it counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { parseToolEntry } from '../../src/agents/tool-list.ts';
import { resolveSubagentTools, type ToolsOutcome } from '../../src/agents/tool-resolution.ts';
import { background, FULL_POOL, run, type Fields } from '../support/tool-pool.ts';

const resolve = (fields: Fields, how = run()): ToolsOutcome =>
  resolveSubagentTools({ name: 'helper', ...fields }, FULL_POOL, how);
const granted = (outcome: ToolsOutcome): readonly string[] => (outcome.ok ? outcome.tools : []);

describe('how an entry is read', () => {
  test('a specifier on a tools entry grants the whole tool, as in disallowedTools', () => {
    expect(granted(resolve({ tools: ['Bash(git status *)'] }))).toEqual(['Bash']);
  });

  test('an empty type list, Agent(), allows any type', () => {
    expect(parseToolEntry('Agent()')).toEqual({ name: 'Agent', spawn: 'any' });
  });

  test('an entry without its closing parenthesis is a name nothing matches', () => {
    const outcome = resolve({ tools: ['Bash(git push'] });
    expect(outcome.ok ? [] : outcome.refusal.unrecognized).toEqual(['Bash(git push']);
  });

  test('an unanchored glob in tools matches nothing, as an allow rule does', () => {
    for (const entry of ['*', 'mcp__*', 'Re*']) {
      const outcome = resolve({ tools: [entry] });
      expect(outcome.ok ? [] : outcome.refusal.matchedNoTools).toEqual([entry]);
    }
  });

  test('a glob after a literal server prefix matches in tools (mcp__github__get_*)', () => {
    expect(granted(resolve({ tools: ['mcp__github__get_*'] }))).toEqual(['mcp__github__get_pr']);
  });

  test('a glob in disallowedTools matches built-in tool names too', () => {
    const tools = granted(resolve({ disallowedTools: ['Web*'] }));
    expect(tools).not.toContain('WebFetch');
    expect(tools).not.toContain('WebSearch');
    expect(tools).toContain('Read');
  });

  test('tool names are case-sensitive: read is no tool', () => {
    const outcome = resolve({ tools: ['read'] });
    expect(outcome.ok ? [] : outcome.refusal.unrecognized).toEqual(['read']);
  });
});

describe('what is granted and in which order', () => {
  test('the tools come in the order of the entries, once each', () => {
    expect(granted(resolve({ tools: ['Write', 'Read', 'Write', 'Bash(x)'] }))).toEqual([
      'Write',
      'Read',
      'Bash',
    ]);
  });

  test('an agent running as the main thread is not narrowed by the subagent filters', () => {
    const main = run({ asMainThread: true, background: true });
    expect(granted(resolve({ tools: ['AskUserQuestion', 'CronCreate'] }, main))).toEqual([
      'AskUserQuestion',
      'CronCreate',
    ]);
  });

  test('tools and disallowedTools still apply to the agent running as the main thread', () => {
    const main = run({ asMainThread: true });
    expect(
      granted(resolve({ tools: ['Read', 'Write'], disallowedTools: ['Write'] }, main)),
    ).toEqual(['Read']);
  });

  test('a fork ignores both fields and is never refused', () => {
    const outcome = resolve({ tools: ['Grpe'], disallowedTools: ['Read'] }, run({ kind: 'fork' }));
    expect(granted(outcome)).toContain('Read');
    expect(outcome.ok).toBe(true);
  });

  test('the granted tools follow the order of the entries, not the order of the pool', () => {
    const reversed = { ...FULL_POOL, builtin: [...FULL_POOL.builtin].toReversed() };
    const outcome = resolveSubagentTools(
      { name: 'helper', tools: ['Read', 'Bash'] },
      reversed,
      run(),
    );
    expect(granted(outcome)).toEqual(['Read', 'Bash']);
  });

  test('a mixed list where disallowedTools emptied one entry and the other matched nothing is not refused', () => {
    // sub-agents.md applies disallowedTools first; errors.md only says a list it empties entirely is not refused.
    const outcome = resolve({
      tools: ['mcp__github__*', 'Grpe'],
      disallowedTools: ['mcp__github'],
    });
    expect(outcome.ok).toBe(true);
    expect(granted(outcome)).toEqual([]);
  });

  test('SubagentHandback is not inherited and is not a tool a list can name without the host granting it', () => {
    expect(granted(resolve({}))).not.toContain('SubagentHandback');
    const outcome = resolve({ tools: ['SubagentHandback'] });
    expect(outcome.ok ? [] : outcome.refusal.notAvailableToSubagents).toEqual(['SubagentHandback']);
  });
});

describe('the refusal', () => {
  test('groups are joined in the order unrecognized, not available, matched no tools', () => {
    const outcome = resolve(
      { tools: ['mcp__nope__*', 'CronCreate', 'Grpe', 'Grep2'] },
      background(),
    );
    expect(outcome.ok ? '' : outcome.refusal.message).toBe(
      "Agent 'helper' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [Grpe, Grep2]; not available to subagents [CronCreate]; matched no tools in this session [mcp__nope__*]. Fix the agent's tools frontmatter or pass a different subagent_type.",
    );
  });

  test('an entry that disallowedTools took away did match, so a typo beside it does not refuse', () => {
    const outcome = resolve({ tools: ['Read', 'Grpe'], disallowedTools: ['Read'] });
    expect(outcome.ok).toBe(true);
    expect(granted(outcome)).toEqual([]);
  });

  test('a host-specific built-in the kit does not know is recognized when the pool has it', () => {
    const pool = { builtin: ['HostSearch'], mcp: [] };
    const outcome = resolveSubagentTools({ name: 'helper', tools: ['HostSearch'] }, pool, run());
    expect(granted(outcome)).toEqual(['HostSearch']);
    const dropped = resolveSubagentTools(
      { name: 'helper', tools: ['HostSearch'] },
      pool,
      background(),
    );
    expect(dropped.ok ? [] : dropped.refusal.notAvailableToSubagents).toEqual(['HostSearch']);
  });
});
