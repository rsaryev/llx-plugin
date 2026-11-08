/**
 * sub-agents.md § Define hooks for subagents > Hooks in subagent frontmatter: "These hooks only run
 * while that specific subagent is active and are cleaned up when it finishes"; frontmatter hooks fire
 * for a subagent and for the main session (`--agent`, the `agent` setting); the matcher input of
 * `PreToolUse` and `PostToolUse` is the tool name, `Stop` has none and "is converted to
 * `SubagentStop` at runtime"; the project-level trust rule. hooks.md § Matcher patterns for how a
 * matcher reads. The examples are the docs' code-reviewer and db-reader agents.
 */
import { describe, expect, test } from 'bun:test';
import { agentHookGroups, hooksTrustGate, selectAgentHooks } from '../../src/agents/hooks.ts';
import { readAgent } from '../../src/format/agent.ts';
import { AGENT_SOURCES, type AgentSource } from '../../src/format/agent-record.ts';
import { at, file, loaded, plugin } from '../support/agent-files.ts';
import { CODE_REVIEWER, commands, reviewer, VALIDATE } from '../support/agent-hooks.ts';
import { spec } from '../support/spec.ts';

spec('agents.frontmatter.hooks', () => {
  test('hooks of a plugin agent never fire, in a subagent or a main-session run', () => {
    // components.md: plugin agents ignore `hooks`, so the record carries none.
    const fromPlugin = loaded(readAgent(file(CODE_REVIEWER), plugin()));
    for (const run of ['subagent', 'main-session'] as const) {
      expect(agentHookGroups(fromPlugin, run)).toEqual({});
      expect(commands(fromPlugin, { event: 'PreToolUse', matcherValue: 'Bash', run })).toEqual([]);
    }
  });

  test('a plugin record that somehow carries hooks still fires none', () => {
    const hooks = reviewer().hooks;
    expect(agentHookGroups({ hooks, source: 'plugin' }, 'subagent')).toEqual({});
    expect(
      selectAgentHooks(
        { hooks, source: 'plugin' },
        {
          run: 'subagent',
          event: 'PreToolUse',
          matcherValue: 'Bash',
          active: true,
          folderTrusted: true,
        },
      ).groups,
    ).toEqual([]);
  });

  test('an agent without hooks selects nothing', () => {
    const agent = loaded(readAgent(file('name: plain\ndescription: Plain'), at('user')));
    expect(agentHookGroups(agent, 'subagent')).toEqual({});
    expect(
      selectAgentHooks(agent, {
        run: 'subagent',
        event: 'PreToolUse',
        matcherValue: 'Bash',
        active: true,
        folderTrusted: false,
      }),
    ).toEqual({ groups: [] });
  });

  test('every event is supported: an event outside the common three selects by its own matcher input', () => {
    const agent = loaded(
      readAgent(
        file(
          [
            'name: wide',
            'description: Wide',
            'hooks:',
            '  SessionStart:',
            '    - matcher: startup',
            '      hooks: [{ type: command, command: ./start.sh }]',
            '  UserPromptSubmit:',
            '    - matcher: ignored',
            '      hooks: [{ type: command, command: ./prompt.sh }]',
            '  PostToolUseFailure:',
            '    - matcher: "Bash"',
            '      hooks: [{ type: command, command: ./failed.sh }]',
          ].join('\n'),
        ),
        at('user'),
      ),
    );
    expect(
      commands(agent, { event: 'SessionStart', matcherValue: 'startup', run: 'main-session' }),
    ).toEqual(['./start.sh']);
    expect(
      commands(agent, { event: 'SessionStart', matcherValue: 'resume', run: 'main-session' }),
    ).toEqual([]);
    expect(commands(agent, { event: 'UserPromptSubmit', run: 'main-session' })).toEqual([
      './prompt.sh',
    ]);
    expect(commands(agent, { event: 'PostToolUseFailure', matcherValue: 'Bash' })).toEqual([
      './failed.sh',
    ]);
  });

  describe('the trust rule for project-level hooks', () => {
    const fire = { event: 'PreToolUse', matcherValue: 'Bash' } as const;

    test('a project agent in an untrusted folder runs, but its hooks are skipped', () => {
      const agent = reviewer('project');
      const selection = selectAgentHooks(agent, {
        run: 'subagent',
        active: true,
        folderTrusted: false,
        ...fire,
      });
      expect(selection).toEqual({ groups: [], skipped: 'untrusted' });
    });

    test('once the folder holding the agent file is trusted the hooks fire', () => {
      expect(commands(reviewer('project'), { ...fire, folderTrusted: true })).toEqual([VALIDATE]);
    });

    test.each(['user', 'managed'] as const)(
      'a %s agent runs its hooks without any folder trust',
      (source) => {
        expect(commands(reviewer(source), { ...fire, folderTrusted: false })).toEqual([VALIDATE]);
      },
    );

    test('the gate is a function of the source and the folder trust only', () => {
      const gate: Record<AgentSource, 'run' | 'skip-untrusted'> = {
        managed: 'run',
        flag: 'run',
        project: 'skip-untrusted',
        user: 'run',
        plugin: 'run',
      };
      for (const source of AGENT_SOURCES) {
        expect(hooksTrustGate(source, false)).toBe(gate[source]);
        expect(hooksTrustGate(source, true)).toBe('run');
      }
    });

    test('the same trust applies to the main-session run of a project agent', () => {
      const agent = reviewer('project');
      expect(commands(agent, { ...fire, run: 'main-session', folderTrusted: false })).toEqual([]);
      expect(commands(agent, { ...fire, run: 'main-session', folderTrusted: true })).toEqual([
        VALIDATE,
      ]);
    });

    test('an untrusted project agent skips every event, the converted SubagentStop included', () => {
      const agent = reviewer('project');
      for (const event of ['PostToolUse', 'SubagentStop'] as const) {
        expect(commands(agent, { event, matcherValue: 'Edit', folderTrusted: false })).toEqual([]);
      }
    });
  });
});
