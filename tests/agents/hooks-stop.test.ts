/**
 * sub-agents.md § Define hooks for subagents > Hooks in subagent frontmatter: "These hooks only run
 * while that specific subagent is active and are cleaned up when it finishes"; frontmatter hooks fire
 * for a subagent and for the main session (`--agent`, the `agent` setting); the matcher input of
 * `PreToolUse` and `PostToolUse` is the tool name, `Stop` has none and "is converted to
 * `SubagentStop` at runtime"; the project-level trust rule. hooks.md § Matcher patterns for how a
 * matcher reads. The examples are the docs' code-reviewer and db-reader agents.
 */
import { expect, test } from 'bun:test';
import { agentHookGroups } from '../../src/agents/hooks.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, loaded } from '../support/agent-files.ts';
import { commands, reviewer, SUMMARIZE } from '../support/agent-hooks.ts';
import { spec } from '../support/spec.ts';

spec('agents.hookEvent.Stop', () => {
  test('in a subagent run the Stop hook fires as SubagentStop', () => {
    const agent = reviewer();
    expect(commands(agent, { event: 'SubagentStop', matcherValue: 'code-reviewer' })).toEqual([
      SUMMARIZE,
    ]);
    expect(commands(agent, { event: 'Stop' })).toEqual([]);
  });

  test('the converted groups leave no Stop key behind', () => {
    const groups = agentHookGroups(reviewer(), 'subagent');
    expect(Object.keys(groups).toSorted()).toEqual(['PostToolUse', 'PreToolUse', 'SubagentStop']);
    expect(groups.SubagentStop?.map((group) => group.hooks.length)).toEqual([1]);
  });

  test('in a main-session run Stop stays Stop and SubagentStop is not produced', () => {
    const agent = reviewer();
    expect(commands(agent, { event: 'Stop', run: 'main-session' })).toEqual([SUMMARIZE]);
    expect(commands(agent, { event: 'SubagentStop', run: 'main-session' })).toEqual([]);
    expect(Object.keys(agentHookGroups(agent, 'main-session')).toSorted()).toEqual([
      'PostToolUse',
      'PreToolUse',
      'Stop',
    ]);
  });

  test('Stop has no matcher input: it fires whatever value the host passes', () => {
    const agent = reviewer();
    for (const matcherValue of [undefined, '', 'anything']) {
      expect(commands(agent, { event: 'Stop', run: 'main-session', matcherValue })).toEqual([
        SUMMARIZE,
      ]);
    }
  });

  test('a matcher written on Stop is ignored, also after the conversion to SubagentStop', () => {
    const agent = loaded(
      readAgent(
        file(
          'name: odd\ndescription: Odd\nhooks:\n  Stop:\n    - matcher: Bash\n      hooks: [{ type: command, command: ./done.sh }]',
        ),
        at('user'),
      ),
    );
    expect(commands(agent, { event: 'Stop', run: 'main-session', matcherValue: 'x' })).toEqual([
      './done.sh',
    ]);
    expect(commands(agent, { event: 'SubagentStop', matcherValue: 'odd' })).toEqual(['./done.sh']);
  });

  test('a SubagentStop group written in the file is kept in front of the converted Stop groups', () => {
    const agent = loaded(
      readAgent(
        file(
          [
            'name: both',
            'description: Both',
            'hooks:',
            '  Stop:',
            '    - hooks: [{ type: command, command: ./stop.sh }]',
            '  SubagentStop:',
            '    - hooks: [{ type: command, command: ./own.sh }]',
          ].join('\n'),
        ),
        at('user'),
      ),
    );
    expect(commands(agent, { event: 'SubagentStop', matcherValue: 'both' })).toEqual([
      './own.sh',
      './stop.sh',
    ]);
    expect(agentHookGroups(agent, 'subagent').Stop).toBeUndefined();
  });

  test('the conversion does not change the agent record', () => {
    const agent = reviewer();
    const before = structuredClone(agent.hooks);
    agentHookGroups(agent, 'subagent');
    expect(agent.hooks).toEqual(before);
  });
});
