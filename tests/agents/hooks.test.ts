/**
 * sub-agents.md § Define hooks for subagents > Hooks in subagent frontmatter: "These hooks only run
 * while that specific subagent is active and are cleaned up when it finishes"; frontmatter hooks fire
 * for a subagent and for the main session (`--agent`, the `agent` setting); the matcher input of
 * `PreToolUse` and `PostToolUse` is the tool name, `Stop` has none and "is converted to
 * `SubagentStop` at runtime"; the project-level trust rule. hooks.md § Matcher patterns for how a
 * matcher reads. The examples are the docs' code-reviewer and db-reader agents.
 */
import { describe, expect, test } from 'bun:test';
import { selectAgentHooks } from '../../src/agents/hooks.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, loaded } from '../support/agent-files.ts';
import { dbReader, commands, reviewer, LINT, VALIDATE } from '../support/agent-hooks.ts';
import { spec } from '../support/spec.ts';

spec('agents.hookEvent.PreToolUse', () => {
  test('matcher "Bash" selects a Bash call and no other tool', () => {
    const agent = reviewer();
    expect(commands(agent, { event: 'PreToolUse', matcherValue: 'Bash' })).toEqual([VALIDATE]);
    for (const tool of ['Read', 'Edit', 'Write', 'Grep', 'PowerShell', 'Task']) {
      expect(commands(agent, { event: 'PreToolUse', matcherValue: tool })).toEqual([]);
    }
  });

  test('the matcher is an exact tool name, case-sensitive and not a prefix', () => {
    const agent = reviewer();
    for (const tool of ['bash', 'BashOutput', 'Bash2', 'mcp__shell__Bash']) {
      expect(commands(agent, { event: 'PreToolUse', matcherValue: tool })).toEqual([]);
    }
  });

  test('the db-reader example validates every Bash call before it runs', () => {
    expect(commands(dbReader(), { event: 'PreToolUse', matcherValue: 'Bash' })).toEqual([
      './scripts/validate-readonly-query.sh',
    ]);
    expect(commands(dbReader(), { event: 'PreToolUse', matcherValue: 'Read' })).toEqual([]);
  });

  test('a PreToolUse group does not fire for a PostToolUse call', () => {
    expect(commands(reviewer(), { event: 'PostToolUse', matcherValue: 'Bash' })).toEqual([]);
  });

  test('a main-session run selects the same PreToolUse group', () => {
    expect(
      commands(reviewer(), { event: 'PreToolUse', matcherValue: 'Bash', run: 'main-session' }),
    ).toEqual([VALIDATE]);
  });

  test('a group without a matcher, "*" and "" select every tool; a regular expression is unanchored', () => {
    const agent = loaded(
      readAgent(
        file(
          [
            'name: broad',
            'description: Broad hooks',
            'hooks:',
            '  PreToolUse:',
            '    - hooks: [{ type: command, command: ./all.sh }]',
            '    - matcher: "*"',
            '      hooks: [{ type: command, command: ./star.sh }]',
            '    - matcher: ""',
            '      hooks: [{ type: command, command: ./empty.sh }]',
            '    - matcher: "^Notebook"',
            '      hooks: [{ type: command, command: ./notebook.sh }]',
          ].join('\n'),
        ),
        at('user'),
      ),
    );
    expect(commands(agent, { event: 'PreToolUse', matcherValue: 'Read' })).toEqual([
      './all.sh',
      './star.sh',
      './empty.sh',
    ]);
    expect(commands(agent, { event: 'PreToolUse', matcherValue: 'NotebookEdit' })).toEqual([
      './all.sh',
      './star.sh',
      './empty.sh',
      './notebook.sh',
    ]);
  });
});

spec('agents.hookEvent.PostToolUse', () => {
  test('matcher "Edit|Write" selects Edit and Write', () => {
    const agent = reviewer();
    expect(commands(agent, { event: 'PostToolUse', matcherValue: 'Edit' })).toEqual([LINT]);
    expect(commands(agent, { event: 'PostToolUse', matcherValue: 'Write' })).toEqual([LINT]);
  });

  test('it does not select Read, Bash, or a tool whose name only contains Edit', () => {
    const agent = reviewer();
    for (const tool of ['Read', 'Bash', 'Grep', 'NotebookEdit', 'MultiEdit', 'edit']) {
      expect(commands(agent, { event: 'PostToolUse', matcherValue: tool })).toEqual([]);
    }
  });

  test('a main-session run selects the same PostToolUse group', () => {
    expect(
      commands(reviewer(), { event: 'PostToolUse', matcherValue: 'Write', run: 'main-session' }),
    ).toEqual([LINT]);
  });

  test('a PostToolUse group does not fire for a PreToolUse call', () => {
    expect(commands(reviewer(), { event: 'PreToolUse', matcherValue: 'Edit' })).toEqual([]);
  });
});

describe('hooks fire only while the agent is active', () => {
  spec(['agents.hookEvent.PreToolUse', 'agents.hookEvent.PostToolUse'], () => {
    test('an inactive agent selects nothing and says it was inactive', () => {
      const agent = reviewer();
      const pre = selectAgentHooks(agent, {
        run: 'subagent',
        event: 'PreToolUse',
        matcherValue: 'Bash',
        active: false,
        folderTrusted: true,
      });
      expect(pre).toEqual({ groups: [], skipped: 'inactive' });
      const post = selectAgentHooks(agent, {
        run: 'subagent',
        event: 'PostToolUse',
        matcherValue: 'Edit',
        active: false,
        folderTrusted: true,
      });
      expect(post).toEqual({ groups: [], skipped: 'inactive' });
    });

    test('the same agent selects its hooks again while active', () => {
      expect(
        commands(reviewer(), { event: 'PreToolUse', matcherValue: 'Bash', active: true }),
      ).toEqual([VALIDATE]);
    });
  });
});
