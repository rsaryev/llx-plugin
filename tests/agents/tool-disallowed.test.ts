/**
 * sub-agents.md, "Frontmatter reference" (`disallowedTools`) and "Restrict which tools a subagent
 * can use" (with "MCP server names that contain a double underscore"); tools-reference.md, the
 * paragraph on which tools a non-fork subagent can use ("Both set: `disallowedTools` takes
 * precedence").
 */
import { expect, test } from 'bun:test';
import { spec } from '../support/spec.ts';
import { GITHUB, granted, MCP_NAMES, names, resolve, run, sorted } from '../support/tool-pool.ts';

spec('agents.frontmatter.disallowedTools', () => {
  test('omitted tools: the subagent inherits its pool except the listed tools', () => {
    const tools = names({ disallowedTools: ['Write', 'Edit'] });
    expect(tools).not.toContain('Write');
    expect(tools).not.toContain('Edit');
    expect(tools).toContain('Bash');
    expect(tools).toEqual(expect.arrayContaining(MCP_NAMES));
    expect(tools).toEqual(sorted(names({}).filter((tool) => tool !== 'Write' && tool !== 'Edit')));
  });

  test('a tool listed in both tools and disallowedTools is removed', () => {
    expect(names({ tools: ['Read', 'Write', 'Edit'], disallowedTools: ['Write'] })).toEqual([
      'Edit',
      'Read',
    ]);
  });

  test('disallowedTools is applied first, then tools is resolved against what remains', () => {
    const outcome = resolve({
      tools: ['mcp__github__*', 'Read'],
      disallowedTools: ['mcp__github'],
    });
    expect(granted(outcome)).toEqual(['Read']);
  });

  test('a specifier still removes the whole tool: Bash(git push *) removes Bash', () => {
    const tools = names({ disallowedTools: ['Bash(git push *)'] });
    expect(tools).not.toContain('Bash');
    expect(tools).toContain('Read');
  });

  test('a specifier removes the whole tool from an allowlist too', () => {
    expect(names({ tools: ['Bash', 'Read'], disallowedTools: ['Bash(git push *)'] })).toEqual([
      'Read',
    ]);
  });

  test('mcp__github withholds that server only, keeping other servers and the built-ins', () => {
    const tools = names({ disallowedTools: ['mcp__github'] });
    for (const tool of GITHUB) expect(tools).not.toContain(tool);
    expect(tools).toContain('mcp__slack__post_message');
    expect(tools).toContain('Bash');
  });

  test('mcp__github__* withholds the same tools as mcp__github', () => {
    expect(names({ disallowedTools: ['mcp__github__*'] })).toEqual(
      names({ disallowedTools: ['mcp__github'] }),
    );
  });

  test('mcp__* withholds every MCP tool of every server', () => {
    const tools = names({ disallowedTools: ['mcp__*'] });
    expect(tools.filter((tool) => tool.startsWith('mcp__'))).toEqual([]);
    expect(tools).toContain('Bash');
  });

  test('mcp__reports and mcp__reports__* also withhold the reports__v2 server tools', () => {
    for (const entry of ['mcp__reports', 'mcp__reports__*']) {
      const tools = names({ disallowedTools: [entry] });
      expect(tools).not.toContain('mcp__reports__run_query');
      expect(tools).not.toContain('mcp__reports__v2__get_totals');
      expect(tools).toContain('mcp__github__get_pr');
    }
  });

  test('to withhold only the reports server, list its tools one by one', () => {
    const tools = names({ disallowedTools: ['mcp__reports__run_query'] });
    expect(tools).not.toContain('mcp__reports__run_query');
    expect(tools).toContain('mcp__reports__v2__get_totals');
  });

  test('Agent in disallowedTools keeps the subagent from spawning others', () => {
    const outcome = resolve({ disallowedTools: ['Agent'] });
    expect(granted(outcome)).not.toContain('Agent');
    expect(outcome.ok && outcome.spawnTypes).toBe('none');
  });

  test('a disallowedTools that removes every tools entry does not refuse: no tools, no error', () => {
    const outcome = resolve({ tools: ['Read', 'Grep'], disallowedTools: ['Read', 'Grep'] });
    expect(granted(outcome)).toEqual([]);
  });

  test('a subagent that reports through SubagentHandback gets it even when listed as disallowed', () => {
    const how = run({ handback: true });
    expect(names({ tools: ['Read'] }, how)).toEqual(['Read', 'SubagentHandback']);
    expect(names({ disallowedTools: ['SubagentHandback'] }, how)).toContain('SubagentHandback');
    expect(names({ tools: ['Read'] })).toEqual(['Read']);
  });
});
