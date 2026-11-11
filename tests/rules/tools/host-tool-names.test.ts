/**
 * Judgment (spec/judgments.md): the docs describe Claude Code's own tools only, so a host whose
 * tools carry other names states once how they correspond (`HostToolNames`), and the kit reads
 * every tool name in Claude Code's terms through it.
 */
import { describe, expect, test } from 'bun:test';
import { toolNamesOf } from '../../../src/rules/index.ts';

describe('toolNamesOf (judgment, spec/judgments.md)', () => {
  const names = toolNamesOf({
    toClaude: { write_file: 'Write', task: 'Agent', 'db.query': 'mcp__db__query' },
    missing: ['Glob'],
  });

  test('a mapped host name reads as the Claude Code name, an unmapped one as itself', () => {
    expect(names.claudeName('write_file')).toBe('Write');
    expect(names.claudeName('task')).toBe('Agent');
    expect(names.claudeName('db.query')).toBe('mcp__db__query');
    expect(names.claudeName('Read')).toBe('Read');
  });

  test('a Claude Code name reads back as the host tools that stand for it', () => {
    expect(names.hostNames('Write')).toEqual(['write_file']);
    expect(names.hostNames('mcp__db__query')).toEqual(['db.query']);
    expect(names.hostNames('Read')).toEqual(['Read']);
  });

  test('a Claude Code tool the host lacks, or whose name the host gave to another, has no host tool', () => {
    expect(names.has('Glob')).toBe(false);
    expect(names.hostNames('Glob')).toEqual([]);
    // `write_file` is the host's `Write`, so a Claude Code tool named `write_file` has no host tool.
    expect(names.hostNames('write_file')).toEqual([]);
    expect(names.has('Write')).toBe(true);
  });

  test('an MCP tool called by its mcp__<server>__<tool> name needs no entry, so one that appears per run reads as itself', () => {
    // The mapping is fixed at `openSession`; an MCP server connected later adds no entry.
    for (const tool of ['mcp__late__fetch', 'mcp__plugin_x_db__query']) {
      expect(names.claudeName(tool)).toBe(tool);
      expect(names.claudeNames(tool)).toEqual([tool]);
      expect(names.hostNames(tool)).toEqual([tool]);
      expect(names.has(tool)).toBe(true);
    }
  });

  test('no mapping: every name is the same on both sides', () => {
    const same = toolNamesOf(undefined);
    expect([same.claudeName('Bash'), same.hostNames('Bash'), same.has('Glob')]).toEqual([
      'Bash',
      ['Bash'],
      true,
    ]);
  });
});

describe('a host tool that stands for several Claude Code tools (judgment, spec/judgments.md)', () => {
  const names = toolNamesOf({
    toClaude: { Search: ['Grep', 'Glob'], Research: ['WebSearch', 'WebFetch'], ls: [] },
    callName: (tool, input) => {
      if (tool !== 'Search' || typeof input !== 'object' || input === null) return undefined;
      return 'pattern' in input ? 'Grep' : 'Glob';
    },
  });

  test('each Claude Code name it lists reads back as the host tool', () => {
    expect(names.hostNames('Grep')).toEqual(['Search']);
    expect(names.hostNames('Glob')).toEqual(['Search']);
    expect(names.hostNames('WebFetch')).toEqual(['Research']);
    expect(names.claudeNames('Search')).toEqual(['Grep', 'Glob']);
    expect(names.claudeNames('Read')).toEqual(['Read']);
  });

  test('the name of one call comes from the resolver', () => {
    expect(names.claudeName('Search', { pattern: 'x' })).toBe('Grep');
    expect(names.claudeName('Search', { glob: '*.ts' })).toBe('Glob');
  });

  test('without a resolver answer, or with one the tool does not list, the first listed name', () => {
    expect(names.claudeName('Research', { url: 'https://x' })).toBe('WebSearch');
    expect(names.claudeName('Search')).toBe('Grep');
    const loose = toolNamesOf({ toClaude: { Search: ['Grep', 'Glob'] }, callName: () => 'Bash' });
    expect(loose.claudeName('Search', {})).toBe('Grep');
  });

  test('an empty list is the host name itself', () => {
    expect(names.claudeName('ls')).toBe('ls');
    expect(names.claudeNames('ls')).toEqual(['ls']);
  });
});
