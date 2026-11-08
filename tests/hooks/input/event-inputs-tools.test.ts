/**
 * hooks.md, the "<Event> input" section of PermissionRequest, PostToolBatch and PreToolUse: the
 * documented JSON example is what the kit builds (including `mcp_server` for an MCP tool), and a
 * missing or mistyped field is refused with an error naming it.
 */
import { expect, test } from 'bun:test';
import { builtFromExample, builtInput } from '../../support/hooks-doc-input.ts';
import { spec } from '../../support/spec.ts';

const TRANSCRIPT = '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl';
const head = { session_id: 'abc123', transcript_path: TRANSCRIPT, cwd: '/Users/me' };

spec('hooks.behavior.PermissionRequest input', () => {
  const example = {
    ...head,
    permission_mode: 'default',
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf node_modules', description: 'Remove node_modules directory' },
    permission_suggestions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'rm -rf node_modules' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ],
  };

  test('the documented example', () => {
    expect(builtFromExample('PermissionRequest', example).wire).toEqual(example);
  });

  test('it has no tool_use_id: one a host supplies is dropped with a warning', () => {
    const { wire, warnings } = builtInput('PermissionRequest', {
      tool_name: 'Bash',
      tool_input: {},
      tool_use_id: 'toolu_1',
    });
    expect(wire).not.toHaveProperty('tool_use_id');
    expect(warnings).toEqual(['hooks.PermissionRequest.input.tool_use_id']);
  });

  test('permission_suggestions is optional', () => {
    const { permission_suggestions: _omitted, ...without } = example;
    expect(builtFromExample('PermissionRequest', without).wire).not.toHaveProperty(
      'permission_suggestions',
    );
  });

  test('for an MCP tool the input also carries mcp_server with name and source', () => {
    const server = { name: 'github', source: 'plugin' };
    const { wire } = builtInput('PermissionRequest', {
      tool_name: 'mcp__github__create_issue',
      tool_input: {},
      mcp_server: server,
    });
    expect(wire?.['mcp_server']).toEqual(server);
  });

  test('tool_name and tool_input are required', () => {
    expect(builtInput('PermissionRequest', { tool_input: {} }).errors).toEqual([
      'hooks.PermissionRequest.input.tool_name',
    ]);
    expect(builtInput('PermissionRequest', { tool_name: 'Bash' }).errors).toEqual([
      'hooks.PermissionRequest.input.tool_input',
    ]);
  });
});

spec('hooks.behavior.PostToolBatch input', () => {
  const example = {
    ...head,
    permission_mode: 'default',
    hook_event_name: 'PostToolBatch',
    tool_calls: [
      {
        tool_name: 'Read',
        tool_input: { file_path: '/p/ledger/accounts.py' },
        tool_use_id: 'toolu_01',
        tool_response: '1\tfrom __future__ import annotations\n2\t...',
      },
      {
        tool_name: 'Read',
        tool_input: { file_path: '/p/ledger/transactions.py' },
        tool_use_id: 'toolu_02',
        tool_response: '1\tfrom __future__ import annotations\n2\t...',
      },
    ],
  };

  test('the documented example: tool_calls describes every call of the batch, in order', () => {
    expect(builtFromExample('PostToolBatch', example).wire).toEqual(example);
  });

  test('the response is the serialized tool_result the model sees: a string or content blocks', () => {
    const blocks = [{ type: 'text', text: 'hello' }];
    const { wire } = builtInput('PostToolBatch', {
      tool_calls: [{ tool_name: 'Read', tool_input: {}, tool_use_id: 't', tool_response: blocks }],
    });
    expect(wire?.['tool_calls']).toEqual([
      { tool_name: 'Read', tool_input: {}, tool_use_id: 't', tool_response: blocks },
    ]);
  });

  test.each(['tool_name', 'tool_input', 'tool_use_id'])(
    'a call without %s is refused, naming the entry',
    (field) => {
      const call: Record<string, unknown> = {
        tool_name: 'Read',
        tool_input: {},
        tool_use_id: 't',
      };
      delete call[field];
      expect(builtInput('PostToolBatch', { tool_calls: [call] }).errors).toEqual([
        `hooks.PostToolBatch.input.tool_calls[0].${field}`,
      ]);
    },
  );

  test('tool_calls is required and an array', () => {
    expect(builtInput('PostToolBatch', {}).errors).toEqual([
      'hooks.PostToolBatch.input.tool_calls',
    ]);
    expect(builtInput('PostToolBatch', { tool_calls: 'Read' }).errors).toEqual([
      'hooks.PostToolBatch.input.tool_calls',
    ]);
  });
});

spec('hooks.behavior.PreToolUse input', () => {
  const bash = {
    session_id: 'abc123',
    prompt_id: '550e8400-e29b-41d4-a716-446655440000',
    transcript_path: '/home/user/.claude/projects/p/transcript.jsonl',
    cwd: '/home/user/my-project',
    scratchpad_dir: '/tmp/claude-1000/-home-user-my-project/abc123/scratchpad',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: {
      command: 'npm test',
      description: 'Run test suite',
      timeout: 120000,
      run_in_background: false,
    },
    tool_use_id: 'toolu_01ABC123',
  };

  test('the documented example of the common input fields: a Bash call', () => {
    expect(builtFromExample('PreToolUse', bash).wire).toEqual(bash);
  });

  test('for an MCP tool the input also carries mcp_server: the name and where it came from', () => {
    const { wire } = builtInput('PreToolUse', {
      tool_name: 'mcp__memory__create_entities',
      tool_input: {},
      tool_use_id: 't',
      mcp_server: { name: 'memory', source: 'project' },
    });
    expect(wire?.['mcp_server']).toEqual({ name: 'memory', source: 'project' });
  });

  test('a tool that is not an MCP tool has no mcp_server', () => {
    expect(builtFromExample('PreToolUse', bash).wire).not.toHaveProperty('mcp_server');
  });

  test.each([
    ['tool_name', { tool_input: {}, tool_use_id: 't' }],
    ['tool_input', { tool_name: 'Bash', tool_use_id: 't' }],
    ['tool_use_id', { tool_name: 'Bash', tool_input: {} }],
  ])('without %s there is no input', (field, facts) => {
    const refused = builtInput('PreToolUse', facts);
    expect(refused.wire).toBeUndefined();
    expect(refused.errors).toEqual([`hooks.PreToolUse.input.${field}`]);
  });

  test('an mcp_server without a source is refused', () => {
    const refused = builtInput('PreToolUse', {
      tool_name: 'mcp__a__b',
      tool_input: {},
      tool_use_id: 't',
      mcp_server: { name: 'a' },
    });
    expect(refused.errors).toEqual(['hooks.PreToolUse.input.mcp_server.source']);
  });
});
