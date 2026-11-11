/**
 * sub-agents.md § Available tools: the two filters that leave a subagent fewer tools than its
 * parent has, and tools-reference.md § Agent tool behavior, § Glob tool behavior and the
 * `SubagentHandback` and `ExitWorktree` entries of the tools table.
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
    'tools.tool.AskUserQuestion',
    'tools.tool.EndConversation',
    'tools.tool.EnterPlanMode',
    'tools.tool.ScheduleWakeup',
    'tools.tool.WaitForMcpServers',
    'tools.tool.Workflow',
  ],
  () => {
    describe('sub-agents.md § Available tools: the first filter removes these tools, even when listed in tools', () => {
      const ALWAYS = [
        'AskUserQuestion',
        'EndConversation',
        'EnterPlanMode',
        'ScheduleWakeup',
        'WaitForMcpServers',
        'Workflow',
      ];
      for (const background of [false, true]) {
        test(`never granted to a ${background ? 'background' : 'foreground'} subagent, inherited or listed`, () => {
          const sessionTools = [...ALWAYS, 'Read'];
          expect(resolve({ sessionTools, background }).tools).toEqual(['Read']);
          const listed = resolve({ sessionTools, background, tools: [...ALWAYS, 'Read'] });
          expect(listed.tools).toEqual(['Read']);
        });
      }

      test('a list of only these tools is the zero-tools refusal, grouped as not available to subagents', () => {
        const { issues } = resolve({ sessionTools: ALWAYS, tools: ['EndConversation'] });
        expect(issues[0]?.message).toContain('not available to subagents [EndConversation]');
      });
    });
  },
);

spec('tools.tool.ExitPlanMode', () => {
  describe('sub-agents.md § Available tools: ExitPlanMode, unless the subagent permissionMode is plan', () => {
    const sessionTools = ['Read', 'ExitPlanMode'];

    test('withheld from a subagent in any other mode, foreground or background', () => {
      for (const background of [false, true]) {
        expect(resolve({ sessionTools, background }).tools).toEqual(['Read']);
        expect(resolve({ sessionTools, background, permissionMode: 'default' }).tools).toEqual([
          'Read',
        ]);
      }
    });

    test('kept for permissionMode plan wherever the subagent runs', () => {
      for (const background of [false, true]) {
        const { tools } = resolve({ sessionTools, background, permissionMode: 'plan' });
        expect(tools).toEqual(['Read', 'ExitPlanMode']);
      }
    });
  });
});

spec('tools.tool.Agent', () => {
  describe('sub-agents.md § Available tools: Agent is withheld at the depth limit, kept in the background otherwise', () => {
    const sessionTools = ['Read', 'Agent'];

    test('kept below the depth limit, foreground and background', () => {
      for (const background of [false, true]) {
        expect(resolve({ sessionTools, background }).tools).toEqual(['Read', 'Agent']);
      }
    });

    test('withheld at the depth limit', () => {
      expect(resolve({ sessionTools, atDepthLimit: true }).tools).toEqual(['Read']);
      expect(resolve({ sessionTools, atDepthLimit: true, background: true }).tools).toEqual([
        'Read',
      ]);
    });
  });
});

describe('sub-agents.md § Available tools: the second filter for background subagents', () => {
  const BACKGROUND_KEEPS = [
    'Read',
    'Grep',
    'Glob',
    'LSP',
    'Bash',
    'PowerShell',
    'Edit',
    'Write',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'TodoWrite',
    'Skill',
    'ToolSearch',
    'EnterWorktree',
    'ExitWorktree',
    'Monitor',
    'TaskStop',
    'SendMessage',
    'Artifact',
  ];
  const DROPPED = [
    'CronCreate',
    'CronDelete',
    'CronList',
    'TaskCreate',
    'TaskGet',
    'TaskList',
    'TaskUpdate',
    'ListAgents',
    'PushNotification',
    'RemoteTrigger',
  ];
  const sessionTools = [...BACKGROUND_KEEPS, ...DROPPED, 'mcp__github__get_issue'];

  spec(
    [
      'tools.tool.CronCreate',
      'tools.tool.TaskCreate',
      'tools.tool.ListAgents',
      'tools.tool.LSP',
      'tools.tool.TodoWrite',
    ],
    () => {
      test('a background subagent keeps every MCP tool and only the listed built-in tools', () => {
        const { tools } = resolve({ sessionTools, background: true });
        expect(tools).toEqual([...BACKGROUND_KEEPS, 'mcp__github__get_issue']);
      });

      test('a foreground subagent keeps the rest of the pool too', () => {
        expect(resolve({ sessionTools, background: false }).tools).toEqual(sessionTools);
      });

      test('background is the default: a request that does not say runs in the background', () => {
        const { tools } = resolveRequest({ sessionTools });
        expect(tools).toEqual([...BACKGROUND_KEEPS, 'mcp__github__get_issue']);
      });

      test('listing only a tool the background set drops is the zero-tools refusal', () => {
        const { tools, issues } = resolve({
          sessionTools,
          background: true,
          tools: ['CronCreate'],
        });
        expect(tools).toEqual([]);
        expect(issues[0]?.message).toContain('not available to subagents [CronCreate]');
        // errors.md: "an entry that only a foreground subagent can use lands here when the subagent would run in the background".
        expect(resolve({ sessionTools, background: false, tools: ['CronCreate'] }).tools).toEqual([
          'CronCreate',
        ]);
      });
    },
  );
});

spec('tools.tool.ExitWorktree', () => {
  test('tools-reference.md: not available to a subagent that already runs in its own working directory', () => {
    const sessionTools = ['Read', 'EnterWorktree', 'ExitWorktree'];
    expect(resolve({ sessionTools }).tools).toEqual(sessionTools);
    expect(resolve({ sessionTools, ownWorkingDirectory: true }).tools).toEqual([
      'Read',
      'EnterWorktree',
    ]);
  });
});

spec('tools.tool.SubagentHandback', () => {
  describe('tools-reference.md § Agent tool behavior: where the SubagentHandback conditions hold', () => {
    test('the subagent also gets it, even left out of tools or listed in disallowedTools', () => {
      const request = { tools: ['Read'], disallowedTools: ['SubagentHandback'], handback: true };
      expect(resolve(request).tools).toEqual(['Read', 'SubagentHandback']);
      expect(resolve({ handback: true, tools: ['Read'] }).tools).toEqual([
        'Read',
        'SubagentHandback',
      ]);
    });

    test('a background subagent that reports through it keeps it; without the conditions it is absent', () => {
      expect(resolve({ background: true, handback: true, tools: ['Read'] }).tools).toContain(
        'SubagentHandback',
      );
      expect(resolve({ tools: ['Read'] }).tools).toEqual(['Read']);
    });

    test('it is not duplicated when the parent already has it', () => {
      const sessionTools = ['Read', 'SubagentHandback'];
      expect(resolve({ sessionTools, handback: true }).tools).toEqual(['Read', 'SubagentHandback']);
    });
  });
});

spec(['tools.tool.Glob', 'tools.tool.Grep'], () => {
  describe('tools-reference.md § Glob tool behavior: a subagent that lists Glob or Grep and leaves out Bash', () => {
    const sessionTools = ['Read', 'Bash'];

    test('gets the listed ones back although the session lacks them', () => {
      expect(resolve({ sessionTools, tools: ['Read', 'Grep'] }).tools).toEqual(['Read', 'Grep']);
      expect(resolve({ sessionTools, tools: ['Glob'] }).tools).toEqual(['Glob']);
    });

    test('only the listed one, not the other', () => {
      expect(resolve({ sessionTools, tools: ['Grep'] }).tools).not.toContain('Glob');
    });

    test('does not get them when it also lists Bash, or lists neither', () => {
      expect(resolve({ sessionTools, tools: ['Grep', 'Bash'] }).tools).toEqual(['Bash']);
      expect(resolve({ sessionTools, tools: ['Read'] }).tools).toEqual(['Read']);
    });

    test('an unanchored glob in tools names no tool (permissions.md, "Tool name wildcards"), so it restores nothing', () => {
      const { tools, issues } = resolve({ sessionTools, tools: ['G*'] });
      expect(tools).toEqual([]);
      expect(issues[0]?.message).toContain('matched no tools in this session [G*]');
    });

    test('a subagent with no tools field has what the session has', () => {
      expect(resolve({ sessionTools }).tools).toEqual(['Read', 'Bash']);
    });
  });
});
