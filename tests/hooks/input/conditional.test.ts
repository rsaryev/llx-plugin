/**
 * hooks.md § "SessionStart input" (the four cost fields "when `source` is `resume` or `fork`", `agent_type`
 * "present when you start Claude Code with `claude --agent <name>`"), § "InstructionsLoaded input"
 * (`globs` "Present only for `path_glob_match` loads", `trigger_file_path` "for lazy loads",
 * `parent_file_path` "for `include` loads") and the `agent_id` row of § "TaskCreated input", "TaskCompleted
 * input" and "TeammateIdle input" ("On this event, the common input field identifies the subagent or
 * in-process teammate"). Whether a transcript holds a response to resume from is the host's to know:
 * it supplies the cost fields or not, and the kit sends them for a resumed or forked session only.
 */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { build } from '../../support/hooks-input.ts';

const COST = {
  seconds_since_last_response: 5400,
  context_tokens: 182340,
  prompt_cache_likely_expired: true,
  estimated_cache_write_usd: 1.1396,
} as const;

describe('SessionStart cost fields', () => {
  for (const [name, value] of Object.entries(COST)) {
    spec(`hooks.input.SessionStart.${name}`, () => {
      test.each(['resume', 'fork'] as const)('arrives for a session with source %s', (source) => {
        const { wire, issues } = build('SessionStart', { source, [name]: value });
        expect(issues).toEqual([]);
        expect(wire?.[name]).toBe(value);
      });
      test.each(['startup', 'clear', 'compact'] as const)(
        'is not sent for source %s, and the host is told',
        (source) => {
          const { wire, issues } = build('SessionStart', { source, [name]: value });
          expect(wire).toBeDefined();
          expect(wire).not.toHaveProperty(name);
          expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
            ['warning', `hooks.SessionStart.input.${name}`],
          ]);
        },
      );
      test('is absent when the resumed transcript has no response', () => {
        const { wire } = build('SessionStart', { source: 'resume' });
        expect(wire).not.toHaveProperty(name);
      });
      test('a value of the wrong type is refused', () => {
        const wrong = typeof value === 'boolean' ? 'true' : String(value);
        const { input, issues } = build('SessionStart', { source: 'resume', [name]: wrong });
        expect(input).toBeUndefined();
        expect(issues[0]?.path).toBe(`hooks.SessionStart.input.${name}`);
      });
    });
  }

  test('the docs example of a session resumed 90 minutes later arrives whole', () => {
    const { wire } = build('SessionStart', { source: 'resume', model: 'claude-opus-5', ...COST });
    expect(wire).toMatchObject({
      hook_event_name: 'SessionStart',
      source: 'resume',
      model: 'claude-opus-5',
      ...COST,
    });
  });
});

spec('hooks.input.SessionStart.agent_type', () => {
  test('is the agent name when Claude Code started with --agent', () => {
    expect(
      build('SessionStart', {}, { agent: { type: 'code-reviewer' } }).wire?.['agent_type'],
    ).toBe('code-reviewer');
  });
  test('is absent without --agent', () => {
    expect(build('SessionStart').wire).not.toHaveProperty('agent_type');
  });
});

describe('InstructionsLoaded conditional fields', () => {
  const REASONS = [
    'session_start',
    'nested_traversal',
    'path_glob_match',
    'include',
    'compact',
  ] as const;
  const globs = ['src/**/*.ts'];

  spec('hooks.input.InstructionsLoaded.globs', () => {
    test('is sent for a path_glob_match load', () => {
      const { wire, issues } = build('InstructionsLoaded', {
        load_reason: 'path_glob_match',
        globs,
      });
      expect(issues).toEqual([]);
      expect(wire?.['globs']).toEqual(globs);
    });
    test.each(REASONS.filter((reason) => reason !== 'path_glob_match'))(
      'is not sent for a %s load',
      (load_reason) => {
        const { wire, issues } = build('InstructionsLoaded', { load_reason, globs });
        expect(wire).not.toHaveProperty('globs');
        expect(issues.map((issue) => issue.path)).toEqual(['hooks.InstructionsLoaded.input.globs']);
      },
    );
  });

  spec('hooks.input.InstructionsLoaded.trigger_file_path', () => {
    const trigger = '/Users/my-project/src/a.ts';
    test.each(['nested_traversal', 'path_glob_match'] as const)(
      'is sent for the lazy load %s',
      (load_reason) => {
        const extra = load_reason === 'path_glob_match' ? { globs } : {};
        const { wire } = build('InstructionsLoaded', {
          load_reason,
          trigger_file_path: trigger,
          ...extra,
        });
        expect(wire?.['trigger_file_path']).toBe(trigger);
      },
    );
    test.each(['session_start', 'compact'] as const)(
      'is not sent for the eager load %s',
      (load_reason) => {
        const { wire, issues } = build('InstructionsLoaded', {
          load_reason,
          trigger_file_path: trigger,
        });
        expect(wire).not.toHaveProperty('trigger_file_path');
        expect(issues.map((issue) => issue.path)).toEqual([
          'hooks.InstructionsLoaded.input.trigger_file_path',
        ]);
      },
    );
  });

  spec('hooks.input.InstructionsLoaded.parent_file_path', () => {
    const parent = '/Users/my-project/CLAUDE.md';
    test('is sent for an include load', () => {
      const { wire, issues } = build('InstructionsLoaded', {
        load_reason: 'include',
        parent_file_path: parent,
      });
      expect(issues).toEqual([]);
      expect(wire?.['parent_file_path']).toBe(parent);
    });
    test.each(REASONS.filter((reason) => reason !== 'include'))(
      'is not sent for a %s load',
      (load_reason) => {
        const { wire } = build('InstructionsLoaded', { load_reason, parent_file_path: parent });
        expect(wire).not.toHaveProperty('parent_file_path');
      },
    );
  });
});

describe('agent_id on the task and teammate events', () => {
  const events = [
    ['TaskCreated', 'creating the task'],
    ['TaskCompleted', 'completing the task'],
    ['TeammateIdle', 'about to go idle'],
  ] as const;
  for (const [event, role] of events) {
    spec(`hooks.input.${event}.agent_id`, () => {
      test(`is the subagent or in-process teammate ${role}`, () => {
        const { wire } = build(event, {}, { agent: { id: 'agent-abc123', type: 'implementer' } });
        expect(wire?.['agent_id']).toBe('agent-abc123');
      });
      test('may be absent', () => {
        expect(build(event).wire).not.toHaveProperty('agent_id');
      });
    });
  }
});
