/**
 * hooks.md § "Stop input": the `background_tasks` entries (`id`, `type`, `status`, `description`
 * "capped at 1000 characters with an in-string `… [+N chars]` marker when clipped", `command` "capped at
 * 1000 characters. Present only for `shell` tasks", `agent_type` "only for `subagent` tasks", `server`
 * and `tool` "only for `monitor` and `MCP task` tasks", `name` "only for `workflow` tasks") and the
 * `session_crons` entries (`id`, `schedule`, `recurring`, `prompt` "capped at 1000 characters with the
 * same marker"). The docs' ids hang these entry fields on Stop; the kit builds them the same way for
 * SubagentStop, which "also receive[s] the `background_tasks` and `session_crons` arrays described under
 * Stop input" (tested at the end, outside spec). Which task exists is the host's; the kit proves the
 * shape it sends, the cap and the per-type presence.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { spec } from '../../support/spec.ts';
import { build } from '../../support/hooks-input.ts';

const EntriesSchema = z.array(z.record(z.string(), z.unknown()));
const shell = { id: 'task-001', type: 'shell', status: 'running', description: 'tail logs' };
const clipped = (length: number): string => 'x'.repeat(length);
/** The first entry of an array of the input; `{}` when the input was not built (a refused one). */
const first = (wire: Record<string, unknown> | undefined, key: string): Record<string, unknown> =>
  EntriesSchema.safeParse(wire?.[key]).data?.[0] ?? {};

/** A task of the given type with the field under test, as Claude Code would build it. */
const task = (type: string, extra: Record<string, unknown>) => ({
  ...shell,
  type,
  ...extra,
});

/** Builds a Stop input with one task and returns that task as the hook reads it. */
const taskOf = (entry: Record<string, unknown>) => {
  const built = build('Stop', { background_tasks: [entry] });
  return { ...built, task: first(built.wire, 'background_tasks') };
};

describe('the docs example', () => {
  test('one in-flight shell task and one recurring cron arrive as written', () => {
    const crons = [
      { id: 'cron-001', schedule: '0 9 * * 1-5', recurring: true, prompt: 'check the build' },
    ];
    const tasks = [{ ...shell, command: 'tail -f /var/log/syslog' }];
    const { wire, issues } = build('Stop', {
      stop_hook_active: true,
      last_assistant_message: "I've completed the refactoring.",
      background_tasks: tasks,
      session_crons: crons,
    });
    expect(issues).toEqual([]);
    expect(wire?.['background_tasks']).toEqual(tasks);
    expect(wire?.['session_crons']).toEqual(crons);
  });
  test('both arrays are empty when nothing is in flight or scheduled', () => {
    const { wire } = build('Stop', { background_tasks: [], session_crons: [] });
    expect(wire?.['background_tasks']).toEqual([]);
    expect(wire?.['session_crons']).toEqual([]);
  });
  test('both arrays are absent when the task registry is not reachable', () => {
    const { wire } = build('Stop');
    expect(wire).not.toHaveProperty('background_tasks');
    expect(wire).not.toHaveProperty('session_crons');
  });
});

describe('required entry fields', () => {
  for (const field of ['id', 'type', 'status', 'description'] as const) {
    spec(`hooks.input.Stop.${field}`, () => {
      test('arrives with the task', () => {
        const { task: sent, issues } = taskOf({ ...shell, [field]: `v-${field}` });
        expect(issues).toEqual([]);
        expect(sent[field]).toBe(`v-${field}`);
      });
      test('a task without it, or with another type of value, is refused', () => {
        for (const bad of [undefined, 7]) {
          const entry: Record<string, unknown> = { ...shell, [field]: bad };
          if (bad === undefined) delete entry[field];
          const { input, issues } = taskOf(entry);
          expect(input).toBeUndefined();
          expect(issues[0]?.severity).toBe('error');
          expect(issues[0]?.path).toBe(`hooks.Stop.input.background_tasks[0].${field}`);
        }
      });
    });
  }
});

describe('type labels', () => {
  test.each(['shell', 'subagent', 'monitor', 'workflow', 'teammate', 'cloud session', 'MCP task'])(
    'the label %s arrives unchanged',
    (type) => {
      expect(taskOf({ ...shell, type }).task['type']).toBe(type);
    },
  );
  test('a label the docs do not list ("falls back to the raw discriminant") arrives too', () => {
    expect(taskOf({ ...shell, type: 'local_agent' }).task['type']).toBe('local_agent');
  });
});

spec('hooks.input.Stop.description', () => {
  test('a description within 1000 characters arrives whole', () => {
    expect(taskOf({ ...shell, description: clipped(1000) }).task['description']).toBe(
      clipped(1000),
    );
  });
  test('a longer one is clipped to 1000 characters and marked with how many were cut', () => {
    const { task: sent, issues } = taskOf({ ...shell, description: clipped(1250) });
    expect(issues).toEqual([]);
    expect(sent['description']).toBe(`${clipped(1000)}… [+250 chars]`);
  });
  test('a clip by one character says so', () => {
    expect(taskOf({ ...shell, description: clipped(1001) }).task['description']).toBe(
      `${clipped(1000)}… [+1 chars]`,
    );
  });
});

spec('hooks.input.Stop.command', () => {
  test('is the command line of a shell task', () => {
    const { task: sent, issues } = taskOf(task('shell', { command: 'tail -f /var/log/syslog' }));
    expect(issues).toEqual([]);
    expect(sent['command']).toBe('tail -f /var/log/syslog');
  });
  test('is capped at 1000 characters with the marker', () => {
    expect(taskOf(task('shell', { command: clipped(1500) })).task['command']).toBe(
      `${clipped(1000)}… [+500 chars]`,
    );
  });
  test.each(['subagent', 'monitor', 'workflow', 'MCP task'])(
    'is not sent for a %s task, and the host is told',
    (type) => {
      const { task: sent, issues } = taskOf(task(type, { command: 'ls' }));
      expect(sent).not.toHaveProperty('command');
      expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
        ['warning', 'hooks.Stop.input.background_tasks[0].command'],
      ]);
    },
  );
});

describe('fields of one task type', () => {
  const CASES = [
    {
      field: 'agent_type',
      value: 'Explore',
      types: ['subagent'],
      others: ['shell', 'monitor', 'workflow'],
    },
    {
      field: 'server',
      value: 'my_server',
      types: ['monitor', 'MCP task'],
      others: ['shell', 'subagent', 'workflow'],
    },
    {
      field: 'tool',
      value: 'watch_logs',
      types: ['monitor', 'MCP task'],
      others: ['shell', 'subagent', 'workflow'],
    },
    {
      field: 'name',
      value: 'deploy',
      types: ['workflow'],
      others: ['shell', 'subagent', 'monitor', 'MCP task'],
    },
  ] as const;
  for (const { field, value, types, others } of CASES) {
    spec(`hooks.input.Stop.${field}`, () => {
      test.each(types)(`arrives for a %s task`, (type) => {
        const { task: sent, issues } = taskOf(task(type, { [field]: value }));
        expect(issues).toEqual([]);
        expect(sent[field]).toBe(value);
      });
      test.each(others)(`is not sent for a %s task, and the host is told`, (type) => {
        const { task: sent, issues } = taskOf(task(type, { [field]: value }));
        expect(sent).not.toHaveProperty(field);
        expect(issues.map((issue) => issue.path)).toEqual([
          `hooks.Stop.input.background_tasks[0].${field}`,
        ]);
      });
      test('a value of the wrong type is refused', () => {
        const { input } = taskOf(task(types[0], { [field]: 7 }));
        expect(input).toBeUndefined();
      });
    });
  }
});

const cron = {
  id: 'cron-001',
  schedule: '0 9 * * 1-5',
  recurring: true,
  prompt: 'check the build',
};
const cronOf = (entry: Record<string, unknown>) => {
  const built = build('Stop', { session_crons: [entry] });
  return { ...built, cron: first(built.wire, 'session_crons') };
};

describe('session_crons entries', () => {
  const FIELDS = [
    { field: 'id', good: 'cron-001', bad: 7 },
    { field: 'schedule', good: '0 9 * * 1-5', bad: 9 },
    { field: 'recurring', good: false, bad: 'false' },
    { field: 'prompt', good: 'check the build', bad: 1 },
  ] as const;
  for (const { field, good, bad } of FIELDS) {
    spec(`hooks.input.Stop.${field}`, () => {
      test('arrives with the cron', () => {
        const { cron: sent, issues } = cronOf({ ...cron, [field]: good });
        expect(issues).toEqual([]);
        expect(sent[field]).toBe(good);
      });
      test('a cron with another type of value, or without it, is refused', () => {
        for (const value of [bad, undefined]) {
          const entry: Record<string, unknown> = { ...cron, [field]: value };
          if (value === undefined) delete entry[field];
          const { input, issues } = cronOf(entry);
          expect(input).toBeUndefined();
          expect(issues[0]?.path).toBe(`hooks.Stop.input.session_crons[0].${field}`);
        }
      });
    });
  }
  spec('hooks.input.Stop.prompt', () => {
    test('is capped at 1000 characters with the same marker', () => {
      expect(cronOf({ ...cron, prompt: clipped(1003) }).cron['prompt']).toBe(
        `${clipped(1000)}… [+3 chars]`,
      );
    });
    test('a prompt within the cap arrives whole', () => {
      expect(cronOf({ ...cron, prompt: clipped(1000) }).cron['prompt']).toBe(clipped(1000));
    });
  });
});

describe('SubagentStop', () => {
  test('carries the same arrays with the same cap and per-type fields', () => {
    const { wire, issues } = build('SubagentStop', {
      background_tasks: [{ ...shell, description: clipped(1002), agent_type: 'Explore' }],
      session_crons: [{ ...cron, prompt: clipped(1001) }],
    });
    expect(first(wire, 'background_tasks')['description']).toBe(`${clipped(1000)}… [+2 chars]`);
    expect(first(wire, 'background_tasks')).not.toHaveProperty('agent_type');
    expect(first(wire, 'session_crons')['prompt']).toBe(`${clipped(1000)}… [+1 chars]`);
    expect(issues.map((issue) => issue.path)).toEqual([
      'hooks.SubagentStop.input.background_tasks[0].agent_type',
    ]);
  });
});

describe('the cap counts characters', () => {
  test('a character outside the basic plane is one character and is never split', () => {
    const emoji = '😀';
    const { task: sent } = taskOf({ ...shell, description: emoji.repeat(1001) });
    expect(sent['description']).toBe(`${emoji.repeat(1000)}… [+1 chars]`);
  });
});
