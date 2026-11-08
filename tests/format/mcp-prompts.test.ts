/**
 * mcp.md § Use MCP prompts as commands (a server named `anthropic-skills` lists no prompts) and
 * § Execute MCP prompts (`/servername:promptname (MCP)` in the list, `/mcp__servername__promptname`
 * runs it, arguments after the command split on whitespace so each is one token, matched to the
 * prompt's defined parameters, the server name's characters outside `A-Z`, `a-z`, `0-9`, `_`, `-`
 * become `_` and the prompt name is used as the server declares it). The wording of a refusal and what
 * an excess or a missing argument does are judgments (spec/judgments.md), asserted outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  listablePrompts,
  mcpPromptCommand,
  mcpPromptListing,
  readMcpPromptInvocation,
  type McpPromptDefinition,
} from '../../src/index.ts';
import { spec } from '../support/spec.ts';

const prompts: readonly McpPromptDefinition[] = [
  { server: 'github', name: 'list_prs' },
  { server: 'github', name: 'pr_review', arguments: [{ name: 'pr_number', required: true }] },
  {
    server: 'jira',
    name: 'create_issue',
    arguments: [{ name: 'title', required: true }, { name: 'priority' }],
  },
  { server: 'my.server v2', name: 'Weird.Name' },
];

spec('mcp.behavior.Execute MCP prompts', () => {
  test('each prompt is listed as /servername:promptname (MCP)', () => {
    expect(mcpPromptListing('github', 'pr_review')).toBe('/github:pr_review (MCP)');
    expect(mcpPromptListing('jira', 'create_issue')).toBe('/jira:create_issue (MCP)');
  });

  test('typing /mcp__servername__promptname also runs it: the docs example without arguments', () => {
    const read = readMcpPromptInvocation('/mcp__github__list_prs', prompts);
    expect(read).toEqual({
      status: 'invoke',
      invocation: { server: 'github', prompt: 'list_prs', arguments: {} },
    });
  });

  test('arguments are passed space-separated after the command: the docs examples', () => {
    expect(readMcpPromptInvocation('/mcp__github__pr_review 456', prompts)).toEqual({
      status: 'invoke',
      invocation: { server: 'github', prompt: 'pr_review', arguments: { pr_number: '456' } },
    });
    expect(readMcpPromptInvocation('/mcp__jira__create_issue login-bug high', prompts)).toEqual({
      status: 'invoke',
      invocation: {
        server: 'jira',
        prompt: 'create_issue',
        arguments: { title: 'login-bug', priority: 'high' },
      },
    });
  });

  test('the arguments split on whitespace of any kind, so each is a single token', () => {
    const read = readMcpPromptInvocation('/mcp__jira__create_issue\tlogin-bug\n  high', prompts);
    expect(read).toMatchObject({
      status: 'invoke',
      invocation: { arguments: { title: 'login-bug', priority: 'high' } },
    });
  });

  test('quotes group nothing: a quoted phrase is two tokens, and a third one is one too many', () => {
    const phrase = readMcpPromptInvocation('/mcp__jira__create_issue "login bug"', prompts);
    expect(phrase).toMatchObject({
      invocation: { arguments: { title: '"login', priority: 'bug"' } },
    });
    expect(
      readMcpPromptInvocation('/mcp__jira__create_issue "login bug" high', prompts).status,
    ).toBe('refused');
  });

  test('in the command, a server name character outside A-Z, a-z, 0-9, _ and - is replaced with _; the prompt name is used as declared', () => {
    expect(mcpPromptCommand('my.server v2', 'Weird.Name')).toBe('mcp__my_server_v2__Weird.Name');
    expect(readMcpPromptInvocation('/mcp__my_server_v2__Weird.Name', prompts)).toEqual({
      status: 'invoke',
      invocation: { server: 'my.server v2', prompt: 'Weird.Name', arguments: {} },
    });
    // The prompt name is not normalised: a command that replaces its `.` names no prompt.
    expect(readMcpPromptInvocation('/mcp__my_server_v2__Weird_Name', prompts).status).toBe(
      'refused',
    );
  });

  test('the server name is as configured in the listing and normalised only in the command', () => {
    expect(mcpPromptListing('my.server v2', 'Weird.Name')).toBe('/my.server v2:Weird.Name (MCP)');
  });

  test('text that is not an MCP prompt command is not read as one', () => {
    for (const input of ['hello', '/help', '/mcp', '/mcp_x', 'mcp__github__list_prs', '']) {
      expect(readMcpPromptInvocation(input, prompts)).toEqual({ status: 'not-a-prompt' });
    }
  });
});

describe('Use MCP prompts as commands (mcp.md)', () => {
  test("prompts from a server named anthropic-skills don't appear: Claude Code reserves the name for skills synced from claude.ai", () => {
    const all: McpPromptDefinition[] = [
      ...prompts,
      { server: 'anthropic-skills', name: 'brand-guidelines' },
    ];
    expect(listablePrompts(all)).toEqual([...prompts]);
    expect(readMcpPromptInvocation('/mcp__anthropic-skills__brand-guidelines', all).status).toBe(
      'refused',
    );
  });

  test('only the exact name is reserved', () => {
    const near = [
      { server: 'anthropic-skills2', name: 'p' },
      { server: 'Anthropic-Skills', name: 'p' },
    ];
    expect(listablePrompts(near)).toEqual(near);
  });
});

describe('what the docs leave open', () => {
  test('a prompt that takes arguments needs its required ones, and takes no more than it declares', () => {
    expect(readMcpPromptInvocation('/mcp__github__pr_review', prompts)).toMatchObject({
      status: 'refused',
      message: expect.stringContaining('pr_number'),
    });
    expect(readMcpPromptInvocation('/mcp__github__list_prs extra', prompts).status).toBe('refused');
    expect(readMcpPromptInvocation('/mcp__github__pr_review 1 2', prompts).status).toBe('refused');
  });

  test('a command that names no listed prompt is refused with its name', () => {
    expect(readMcpPromptInvocation('/mcp__nope__x', prompts)).toEqual({
      status: 'refused',
      message: 'No MCP prompt matches /mcp__nope__x',
    });
  });

  test('two servers whose names normalise alike: the first listed prompt answers', () => {
    const twins: McpPromptDefinition[] = [
      { server: 'a.b', name: 'p' },
      { server: 'a b', name: 'p' },
    ];
    expect(readMcpPromptInvocation('/mcp__a_b__p', twins)).toMatchObject({
      invocation: { server: 'a.b' },
    });
  });
});
