/**
 * tools-reference.md § Agent tool behavior; sub-agents.md § Available tools and § Restrict which
 * tools a subagent can use; errors.md § Agent would be spawned with zero tools. The tools a
 * non-fork subagent gets from its `tools` and `disallowedTools` fields and the tools available to
 * subagents, with the docs' own examples.
 */
import { describe, expect, test } from 'bun:test';
import { resolveRequest, type SubagentRequest } from '../support/subagent-request.ts';
import { spec } from '../support/spec.ts';

const SESSION = [
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'Edit',
  'Write',
  'mcp__github__get_issue',
  'mcp__slack__post',
];

const resolve = (rest: Partial<SubagentRequest> = {}) =>
  resolveRequest({ sessionTools: SESSION, background: false, ...rest });

spec(
  [
    'tools.tool.Agent',
    'tools.behavior.Agent tool behavior.Neither field set',
    'tools.behavior.Agent tool behavior.tools only',
    'tools.behavior.Agent tool behavior.disallowedTools only',
    'tools.behavior.Agent tool behavior.Both set',
  ],
  () => {
    describe('tools-reference.md § Agent tool behavior: the two fields', () => {
      test('neither field set: every tool available to subagents', () => {
        expect(resolve()).toEqual({ tools: SESSION, issues: [] });
      });

      test('tools only: only the listed tools', () => {
        const { tools } = resolve({ tools: ['Read', 'Grep', 'Glob', 'Bash'] });
        expect(tools).toEqual(['Read', 'Grep', 'Glob', 'Bash']);
      });

      test('disallowedTools only: every parent tool except the listed ones', () => {
        const { tools } = resolve({ disallowedTools: ['Write', 'Edit'] });
        expect(tools).toEqual(SESSION.filter((tool) => tool !== 'Write' && tool !== 'Edit'));
      });

      test('both set: disallowedTools takes precedence, a tool listed in both is removed', () => {
        const { tools } = resolve({ tools: ['Read', 'Edit', 'Bash'], disallowedTools: ['Edit'] });
        expect(tools).toEqual(['Read', 'Bash']);
      });

      test('the result lists each tool of tools once, in the order of the list (spec/judgments.md)', () => {
        expect(resolve({ tools: ['Bash', 'Read', 'Bash'] }).tools).toEqual(['Bash', 'Read']);
      });

      test('a tool the parent does not have is never granted, even when listed', () => {
        expect(resolve({ tools: ['Read', 'WebFetch'] }).tools).toEqual(['Read']);
      });
    });

    describe('sub-agents.md § Restrict which tools a subagent can use: MCP entries', () => {
      test('mcp__github__* in tools gives every tool of that server and no other', () => {
        expect(resolve({ tools: ['mcp__github__*'] }).tools).toEqual(['mcp__github__get_issue']);
      });

      test('mcp__github and mcp__github__* in disallowedTools withhold that server', () => {
        for (const entry of ['mcp__github', 'mcp__github__*']) {
          const { tools } = resolve({ disallowedTools: [entry] });
          expect(tools).toEqual(SESSION.filter((tool) => !tool.startsWith('mcp__github')));
        }
      });

      test('mcp__* in disallowedTools withholds every MCP tool', () => {
        expect(resolve({ disallowedTools: ['mcp__*'] }).tools).toEqual([
          'Read',
          'Grep',
          'Glob',
          'Bash',
          'Edit',
          'Write',
        ]);
      });

      test('a server whose name holds "__": mcp__reports__v2__* in tools reaches it, mcp__reports__v2 does not', () => {
        const sessionTools = ['mcp__reports__v2__get_totals', 'mcp__reports__run_query'];
        expect(resolve({ sessionTools, tools: ['mcp__reports__v2__*'] }).tools).toEqual([
          'mcp__reports__v2__get_totals',
        ]);
        const bare = resolve({ sessionTools, tools: ['mcp__reports__v2'] });
        expect(bare.tools).toEqual([]);
        expect(bare.issues).toHaveLength(1);
      });

      test('mcp__reports in disallowedTools also withholds the tools of reports__v2', () => {
        const sessionTools = ['mcp__reports__v2__get_totals', 'mcp__reports__run_query', 'Read'];
        expect(resolve({ sessionTools, disallowedTools: ['mcp__reports'] }).tools).toEqual([
          'Read',
        ]);
      });
    });

    describe('sub-agents.md: an entry with a specifier names the whole tool', () => {
      test('a disallowedTools entry Bash(git push *) removes the whole Bash tool', () => {
        expect(resolve({ disallowedTools: ['Bash(git push *)'] }).tools).not.toContain('Bash');
      });
    });

    describe('errors.md § Agent would be spawned with zero tools', () => {
      test('every entry unrecognized: an error naming the entries, the docs example message', () => {
        const { tools, issues } = resolve({ name: 'code-reviewer', tools: ['Grpe'] });
        expect(tools).toEqual([]);
        expect(issues).toEqual([
          {
            severity: 'error',
            path: 'tools',
            message:
              "Agent 'code-reviewer' would be spawned with zero tools — refusing. Its tools list resolved to nothing: unrecognized [Grpe]. Fix the agent's tools frontmatter or pass a different subagent_type.",
          },
        ]);
      });

      test('the entries are grouped: unrecognized, not available to subagents, matched no tools in this session', () => {
        const { issues } = resolve({
          tools: ['Grpe', 'AskUserQuestion', 'mcp__linear__*', 'Agent', 'WebFetch'],
        });
        expect(issues[0]?.message).toContain(
          'unrecognized [Grpe]; not available to subagents [AskUserQuestion]; matched no tools in this session [mcp__linear__*, Agent, WebFetch]',
        );
      });

      test('one entry that resolves is enough: no refusal, the others are dropped silently', () => {
        expect(resolve({ tools: ['Grpe', 'Read'] })).toEqual({ tools: ['Read'], issues: [] });
      });

      test('omitting tools never refuses, even when disallowedTools removes everything', () => {
        const result = resolve({ disallowedTools: ['*'] });
        expect(result).toEqual({ tools: [], issues: [] });
      });

      test('an empty tools list launches the subagent without tools', () => {
        expect(resolve({ tools: [] })).toEqual({ tools: [], issues: [] });
      });

      test('disallowedTools that removes every listed entry also launches it without tools', () => {
        expect(resolve({ tools: ['Read'], disallowedTools: ['Read'] })).toEqual({
          tools: [],
          issues: [],
        });
      });

      test('a tools list that holds only Agent at the depth limit resolves to nothing', () => {
        const result = resolve({
          tools: ['Agent'],
          atDepthLimit: true,
          sessionTools: [...SESSION, 'Agent'],
        });
        expect(result.tools).toEqual([]);
        expect(result.issues[0]?.message).toContain('matched no tools in this session [Agent]');
      });
    });
  },
);
