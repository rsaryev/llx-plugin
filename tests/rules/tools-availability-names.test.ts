/**
 * Judgment (spec/judgments.md, `HostToolNames`): the docs name only Claude Code's tools, so
 * `availableTools` reads a host's candidates through `ToolSession.names`, the way
 * `resolveSubagentTools` reads `ToolPool.names`: a host tool goes when any of its Claude Code names
 * is removed (permissions.md § Manage permissions, "A bare tool name ... removes the tool from
 * Claude's context"), since the grant is the host's tool.
 */
import { describe, expect, test } from 'bun:test';
import { availableTools, type ToolSession } from '../../src/rules/tools/availability.ts';
import type { HostToolNames } from '../../src/rules/tools/host-tool-names.ts';
import { parsed } from '../support/rule-context.ts';

const NAMES: HostToolNames = {
  toClaude: {
    write_file: 'Write',
    shell: 'Bash',
    web: ['WebSearch', 'WebFetch'],
    search: ['Grep', 'Glob'],
  },
};

const denying = (...texts: string[]): ToolSession => ({
  platform: 'windows',
  rules: texts.map((text) => parsed(text, 'deny')),
  names: NAMES,
});

const HOST_TOOLS = ['write_file', 'shell', 'web', 'search', 'Read', 'mcp__db__query'];

describe('availableTools over the host names (judgment)', () => {
  test('the candidates and the outcome are the host names; nothing denied keeps them all', () => {
    expect(availableTools(HOST_TOOLS, denying())).toEqual(HOST_TOOLS);
  });

  test('a bare deny of a Claude Code name removes the host tool that stands for it', () => {
    expect(availableTools(HOST_TOOLS, denying('Write'))).toEqual(
      HOST_TOOLS.filter((tool) => tool !== 'write_file'),
    );
    expect(availableTools(HOST_TOOLS, denying('Bash'))).not.toContain('shell');
  });

  test('a host tool that stands for several goes when any one of them is removed', () => {
    expect(availableTools(HOST_TOOLS, denying('WebFetch'))).not.toContain('web');
    expect(availableTools(HOST_TOOLS, denying('Grep'))).not.toContain('search');
  });

  test('a scoped rule still removes nothing', () => {
    expect(availableTools(HOST_TOOLS, denying('WebFetch(domain:x.com)'))).toEqual(HOST_TOOLS);
  });

  test('an unmapped name, an MCP tool among them, is the same on both sides', () => {
    expect(availableTools(HOST_TOOLS, denying('mcp__db'))).toEqual(
      HOST_TOOLS.filter((tool) => tool !== 'mcp__db__query'),
    );
    expect(availableTools(HOST_TOOLS, denying('Read'))).not.toContain('Read');
  });

  test('the posix default reads the Claude Code names: the search tool is left out unless --tools names them', () => {
    const posix: ToolSession = { platform: 'posix', rules: [], names: NAMES };
    expect(availableTools(['search', 'Read'], posix)).toEqual(['Read']);
    const named = { ...posix, toolsFlag: ['Read', 'Grep', 'Glob'] };
    expect(availableTools(['search', 'Read'], named)).toEqual(['search', 'Read']);
  });
});
