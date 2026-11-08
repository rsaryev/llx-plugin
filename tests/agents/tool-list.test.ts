/**
 * sub-agents.md, "Frontmatter reference" (the `tools` and `disallowedTools` rows: "as a
 * comma-separated string such as `Read, Grep, Bash` or a YAML list", "Same format as `tools`") and
 * "Restrict which subagents can be spawned" (`Agent(worker, researcher)`, `Task(...)` as an alias).
 * The read side: what `readAgent` keeps of the two fields, and how one entry reads.
 */
import { describe, expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import { parseToolEntry, toolEntryMatches } from '../../src/agents/tool-list.ts';
import { at, file, loaded } from '../support/agent-files.ts';
import { spec } from '../support/spec.ts';

const NAMED = 'name: helper\ndescription: Helps';
const read = (extra: string) => loaded(readAgent(file(`${NAMED}\n${extra}`), at('project')));

spec('agents.frontmatter.tools', () => {
  test('the comma-separated string and the YAML list are the same list', () => {
    const text = read('tools: Read, Grep, Glob, Bash').definition.tools;
    const list = read('tools:\n  - Read\n  - Grep\n  - Glob\n  - Bash').definition.tools;
    expect(text).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
    expect(list).toEqual(text);
  });

  test('the doc example safe-researcher keeps its four tools', () => {
    const agent = read('tools: Read, Grep, Glob, Bash');
    expect(agent.definition.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
  });

  test('a comma inside parentheses does not split an entry: Agent(worker, researcher) is one', () => {
    const agent = read('tools: Agent(worker, researcher), Read, Bash');
    expect(agent.definition.tools).toEqual(['Agent(worker, researcher)', 'Read', 'Bash']);
  });

  test('omitting the field leaves the definition without tools, so every tool is inherited', () => {
    expect(read('').definition).not.toHaveProperty('tools');
  });

  test('an entry reads as a tool name, with its specifier when it has one', () => {
    expect(parseToolEntry('Read')).toEqual({ name: 'Read' });
    expect(parseToolEntry('  Grep ')).toEqual({ name: 'Grep' });
    expect(parseToolEntry('Bash(git push *)')).toEqual({ name: 'Bash', specifier: 'git push *' });
  });

  test('Agent(worker, researcher) is an allowlist of spawnable types; Agent alone allows any', () => {
    expect(parseToolEntry('Agent(worker, researcher)')).toEqual({
      name: 'Agent',
      spawn: ['worker', 'researcher'],
    });
    expect(parseToolEntry('Agent(worker)')).toEqual({ name: 'Agent', spawn: ['worker'] });
    expect(parseToolEntry('Agent')).toEqual({ name: 'Agent', spawn: 'any' });
  });

  test('Task(...) is an alias of Agent(...)', () => {
    expect(parseToolEntry('Task(worker, researcher)')).toEqual(
      parseToolEntry('Agent(worker, researcher)'),
    );
    expect(parseToolEntry('Task')).toEqual(parseToolEntry('Agent'));
  });

  test('mcp__<server>__* is a whole server; the whole server name is written for one with __', () => {
    const github = parseToolEntry('mcp__github__*');
    expect(toolEntryMatches(github, 'mcp__github__get_pr', 'allow')).toBe(true);
    expect(toolEntryMatches(github, 'mcp__slack__post_message', 'allow')).toBe(false);
    const reports = parseToolEntry('mcp__reports__v2__*');
    expect(toolEntryMatches(reports, 'mcp__reports__v2__get_totals', 'allow')).toBe(true);
    expect(toolEntryMatches(reports, 'mcp__reports__run_query', 'allow')).toBe(false);
  });

  test('without the trailing __*, mcp__reports__v2 matches none of that server tools', () => {
    const bare = parseToolEntry('mcp__reports__v2');
    expect(toolEntryMatches(bare, 'mcp__reports__v2__get_totals', 'allow')).toBe(false);
  });
});

spec('agents.frontmatter.disallowedTools', () => {
  test('it takes the same two formats as tools', () => {
    const text = read('disallowedTools: Write, Edit').definition.disallowedTools;
    const list = read('disallowedTools:\n  - Write\n  - Edit').definition.disallowedTools;
    expect(text).toEqual(['Write', 'Edit']);
    expect(list).toEqual(text);
  });

  test('an entry with a specifier keeps it in the list (Bash(git push *))', () => {
    const agent = read('disallowedTools: Bash(git push *), Edit');
    expect(agent.definition.disallowedTools).toEqual(['Bash(git push *)', 'Edit']);
  });

  test('mcp__reports and mcp__reports__* also cover every tool of a reports__v2 server', () => {
    for (const entry of ['mcp__reports', 'mcp__reports__*']) {
      const parsed = parseToolEntry(entry);
      expect(toolEntryMatches(parsed, 'mcp__reports__run_query', 'deny')).toBe(true);
      expect(toolEntryMatches(parsed, 'mcp__reports__v2__get_totals', 'deny')).toBe(true);
    }
    const one = parseToolEntry('mcp__reports__run_query');
    expect(toolEntryMatches(one, 'mcp__reports__run_query', 'deny')).toBe(true);
    expect(toolEntryMatches(one, 'mcp__reports__v2__get_totals', 'deny')).toBe(false);
  });

  test('mcp__* withholds every MCP tool of every server', () => {
    const all = parseToolEntry('mcp__*');
    expect(toolEntryMatches(all, 'mcp__github__get_pr', 'deny')).toBe(true);
    expect(toolEntryMatches(all, 'mcp__slack__post_message', 'deny')).toBe(true);
    expect(toolEntryMatches(all, 'Read', 'deny')).toBe(false);
  });
});

describe('what the entry of a tools field names', () => {
  test('a tool name is matched exactly, case-sensitively', () => {
    expect(toolEntryMatches(parseToolEntry('Read'), 'Read', 'allow')).toBe(true);
    expect(toolEntryMatches(parseToolEntry('read'), 'Read', 'allow')).toBe(false);
    expect(toolEntryMatches(parseToolEntry('Read'), 'ReadMcpResourceTool', 'allow')).toBe(false);
  });
});
