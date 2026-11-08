/**
 * hooks.md § Hook input and output, "Common input fields": the fields every event's JSON input has
 * (stdin of a command hook, body of an HTTP hook) and the presence rules the docs give them: `prompt_id`
 * "Absent until the first user input", `scratchpad_dir` "Absent when the session has no scratchpad",
 * the mode labeled Manual "arrives as `default`, never as `manual`", `effort` for events "with a
 * tool-use context", `agent_id` and `agent_type` only inside an agent. What the host puts in the
 * session (the id, the cwd, the transcript) arrives unchanged: those are proven as typed delivery,
 * not as the host's own values.
 */
import { describe, expect, test } from 'bun:test';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import type { PermissionMode } from '../../../src/protocol/official.ts';
import { spec } from '../../support/spec.ts';
import { build } from '../../support/hooks-input.ts';

const TOOL_CONTEXT = ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop'] as const;

spec('hooks.input.common.session_id', () => {
  test('every event carries the session id', () => {
    for (const event of HOOK_EVENTS) {
      expect(build(event, {}, { sessionId: 'abc123' }).wire?.['session_id']).toBe('abc123');
    }
  });
});

spec('hooks.input.common.transcript_path', () => {
  test('every event carries the transcript path of the main session', () => {
    for (const event of HOOK_EVENTS) {
      const { wire } = build(event, {}, { transcriptPath: '/home/user/.claude/t.jsonl' });
      expect(wire?.['transcript_path']).toBe('/home/user/.claude/t.jsonl');
    }
  });
});

spec('hooks.input.common.cwd', () => {
  test('the cwd is the one of the session when the hook is invoked', () => {
    expect(build('PreToolUse', {}, { cwd: '/home/user/my-project' }).wire?.['cwd']).toBe(
      '/home/user/my-project',
    );
    expect(build('PreToolUse', {}, { cwd: '/home/user/other' }).wire?.['cwd']).toBe(
      '/home/user/other',
    );
  });
});

spec('hooks.input.common.prompt_id', () => {
  test('is the UUID of the prompt being processed', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(build('PreToolUse', {}, { promptId: id }).wire?.['prompt_id']).toBe(id);
  });
  test('is absent until the first user input', () => {
    const { wire } = build('PreToolUse');
    expect(wire).toBeDefined();
    expect(wire).not.toHaveProperty('prompt_id');
  });
});

spec('hooks.input.common.scratchpad_dir', () => {
  const dir = '/tmp/claude-1000/-home-user-my-project/abc123/scratchpad';
  test('is the session scratchpad directory', () => {
    expect(build('PreToolUse', {}, { scratchpadDir: dir }).wire?.['scratchpad_dir']).toBe(dir);
  });
  test('is absent when the session has no scratchpad', () => {
    expect(build('PreToolUse').wire).not.toHaveProperty('scratchpad_dir');
  });
});

spec('hooks.input.common.permission_mode', () => {
  const modes = ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'] as const;
  test.each(modes)('the mode %s arrives as it is', (mode) => {
    expect(build('PreToolUse', {}, { permissionMode: mode }).wire?.['permission_mode']).toBe(mode);
  });
  test('the mode labeled Manual arrives as default, never as manual', () => {
    const manual = 'manual' as PermissionMode;
    const { wire, issues } = build('PreToolUse', {}, { permissionMode: manual });
    expect(wire?.['permission_mode']).toBe('default');
    expect(issues).toEqual([]);
  });
  test('is absent when the session has no mode', () => {
    expect(build('PreToolUse').wire).not.toHaveProperty('permission_mode');
  });
});

spec('hooks.input.common.effort', () => {
  test.each(TOOL_CONTEXT)('%s carries the effort object with its level', (event) => {
    const { wire } = build(event, {}, { effort: { level: 'xhigh' } });
    expect(wire?.['effort']).toEqual({ level: 'xhigh' });
  });
  test.each([
    'SessionStart',
    'SessionEnd',
    'Notification',
    'UserPromptSubmit',
    'CwdChanged',
  ] as const)('%s, a session-lifecycle event, never carries it', (event) => {
    expect(build(event, {}, { effort: { level: 'high' } }).wire).not.toHaveProperty('effort');
  });
  test('is absent on a model without effort', () => {
    expect(build('PreToolUse').wire).not.toHaveProperty('effort');
  });
});

spec('hooks.input.common.hook_event_name', () => {
  test('names the event that fired, for every event', () => {
    for (const event of HOOK_EVENTS) {
      expect(build(event).wire?.['hook_event_name']).toBe(event);
    }
  });
});

describe('agent fields', () => {
  const inSubagent = { agent: { id: 'agent-abc123', type: 'Explore' } };
  const underAgentFlag = { agent: { type: 'security-reviewer' } };

  spec('hooks.input.common.agent_id', () => {
    test('is the id of the subagent the hook fires in', () => {
      expect(build('PreToolUse', {}, inSubagent).wire?.['agent_id']).toBe('agent-abc123');
    });
    test('is absent on the main thread, even in a session started with --agent', () => {
      expect(build('PreToolUse').wire).not.toHaveProperty('agent_id');
      expect(build('PreToolUse', {}, underAgentFlag).wire).not.toHaveProperty('agent_id');
    });
  });

  spec('hooks.input.common.agent_type', () => {
    test('is the agent name inside a subagent', () => {
      expect(build('PreToolUse', {}, inSubagent).wire?.['agent_type']).toBe('Explore');
    });
    test('is present on the main thread of a session started with --agent', () => {
      expect(build('PreToolUse', {}, underAgentFlag).wire?.['agent_type']).toBe(
        'security-reviewer',
      );
    });
    test('is absent on the main thread of a session without --agent', () => {
      expect(build('PreToolUse', {}, { agent: {} }).wire).not.toHaveProperty('agent_type');
      expect(build('PreToolUse').wire).not.toHaveProperty('agent_type');
    });
    test('a subagent event names the agent in its own facts, not the session agent', () => {
      const { wire } = build(
        'SubagentStart',
        { agent_id: 'agent-9', agent_type: 'Plan' },
        {
          agent: { id: 'agent-1', type: 'Explore' },
        },
      );
      expect(wire?.['agent_id']).toBe('agent-9');
      expect(wire?.['agent_type']).toBe('Plan');
    });
  });
});
