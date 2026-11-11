/**
 * Judgment (spec/judgments.md): a host whose tools carry other names gives `ToolPool.names`, and a
 * subagent's `tools` and `disallowedTools`, written in Claude Code's names, resolve over it: the
 * entries match the Claude Code names, the result names the host's tools.
 */
import { describe, expect, test } from 'bun:test';
import {
  resolveSubagentTools,
  type ToolPool,
  type ToolsOutcome,
} from '../../src/agents/tool-resolution.ts';
import { run, type Fields } from '../support/tool-pool.ts';

const POOL: ToolPool = {
  builtin: ['read_file', 'write_file', 'shell', 'task', 'search'],
  mcp: [{ server: 'db', name: 'db.query' }],
  names: {
    toClaude: {
      read_file: 'Read',
      write_file: 'Write',
      shell: 'Bash',
      task: 'Agent',
      search: 'Grep',
      'db.query': 'mcp__db__query',
    },
    missing: ['Glob'],
  },
};

const resolve = (fields: Fields, how = run()): ToolsOutcome =>
  resolveSubagentTools({ name: 'helper', ...fields }, POOL, how);
const granted = (outcome: ToolsOutcome): readonly string[] => (outcome.ok ? outcome.tools : []);

describe('a pool in the host names (judgment, spec/judgments.md)', () => {
  test('entries in Claude Code names grant the host tools that stand for them', () => {
    expect(granted(resolve({ tools: ['Read', 'Bash(git *)', 'mcp__db__*'] }))).toEqual([
      'read_file',
      'shell',
      'db.query',
    ]);
  });

  test('disallowedTools removes by the Claude Code name', () => {
    const tools = granted(resolve({ disallowedTools: ['Write', 'mcp__db__query'] }));
    expect(tools).toEqual(['read_file', 'shell', 'task', 'search']);
  });

  test('Agent(type) reads the host tool that is Agent', () => {
    const outcome = resolve({ tools: ['Agent(worker)', 'Read'] }, run({ asMainThread: true }));
    expect(outcome.ok && [outcome.tools, outcome.spawnTypes]).toEqual([
      ['task', 'read_file'],
      ['worker'],
    ]);
  });

  test('a restored search tool the host lacks is not granted, one it has comes back as the host tool', () => {
    expect(granted(resolve({ tools: ['Glob', 'Grep'] }))).toEqual(['search']);
    const outcome = resolve({ tools: ['Glob'] });
    expect(outcome.ok ? [] : outcome.refusal.matchedNoTools).toEqual(['Glob']);
  });

  test('a host tool name entry that is not a Claude Code name matches nothing', () => {
    const outcome = resolve({ tools: ['read_file'] });
    expect(outcome.ok ? [] : outcome.refusal.unrecognized).toEqual(['read_file']);
  });

  test('a fork gets the pool as the host names it', () => {
    const outcome = resolve({}, run({ kind: 'fork' }));
    expect(outcome.ok && [outcome.tools, outcome.spawnTypes]).toEqual([
      ['read_file', 'write_file', 'shell', 'task', 'search', 'db.query'],
      'any',
    ]);
  });
});

describe('a host tool that stands for several Claude Code tools (judgment, spec/judgments.md)', () => {
  const GROUPED: ToolPool = {
    builtin: ['Search', 'Research', 'shell', 'Read'],
    mcp: [],
    names: {
      toClaude: { Search: ['Grep', 'Glob'], Research: ['WebSearch', 'WebFetch'], shell: 'Bash' },
    },
  };
  const grouped = (fields: Fields): ToolsOutcome =>
    resolveSubagentTools({ name: 'helper', ...fields }, GROUPED, run());

  test('an entry naming any one of its Claude Code names grants the host tool', () => {
    expect(granted(grouped({ tools: ['Grep'] }))).toEqual(['Search']);
    expect(granted(grouped({ tools: ['WebFetch', 'Read'] }))).toEqual(['Research', 'Read']);
    expect(granted(grouped({ tools: ['Grep', 'Glob'] }))).toEqual(['Search']);
  });

  test('a restored Glob or Grep comes back as the host tool that does both', () => {
    expect(granted(grouped({ tools: ['Glob', 'Read'] }))).toEqual(['Search', 'Read']);
  });

  test('disallowing any one of its names removes the whole host tool', () => {
    expect(granted(grouped({ disallowedTools: ['Grep'] }))).toEqual(['Research', 'shell', 'Read']);
    expect(
      granted(grouped({ tools: ['Grep', 'Glob', 'Read'], disallowedTools: ['Glob'] })),
    ).toEqual(['Read']);
  });
});
