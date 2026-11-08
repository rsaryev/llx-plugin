/**
 * Behaviour the docs leave open for the agent hooks (spec/judgments.md): tested outside spec().
 */
import { expect, test, describe } from 'bun:test';
import { selectAgentHooks } from '../../src/agents/hooks.ts';
import { readAgent } from '../../src/format/agent.ts';
import { at, file, loaded } from '../support/agent-files.ts';
import { commands, reviewer } from '../support/agent-hooks.ts';

describe('what the docs leave open (judgments)', () => {
  test('inactive is reported before untrusted', () => {
    const selection = selectAgentHooks(reviewer('project'), {
      run: 'subagent',
      event: 'PreToolUse',
      matcherValue: 'Bash',
      active: false,
      folderTrusted: false,
    });
    expect(selection.skipped).toBe('inactive');
  });

  test('a skip is reported only for an agent that has hooks', () => {
    const plain = loaded(readAgent(file('name: plain\ndescription: Plain'), at('project')));
    const selection = selectAgentHooks(plain, {
      run: 'subagent',
      event: 'PreToolUse',
      matcherValue: 'Bash',
      active: false,
      folderTrusted: false,
    });
    expect(selection).toEqual({ groups: [] });
  });

  test('a tool event needs a tool name: without one a specific matcher selects nothing', () => {
    expect(commands(reviewer(), { event: 'PreToolUse', matcherValue: undefined })).toEqual([]);
  });

  test('StopFailure uses the narrow matcher set: a hyphenated matcher is a regular expression', () => {
    const agent = loaded(
      readAgent(
        file(
          'name: errs\ndescription: Errs\nhooks:\n  StopFailure:\n    - matcher: rate-limit\n      hooks: [{ type: command, command: ./e.sh }]',
        ),
        at('user'),
      ),
    );
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'rate-limit' })).toEqual([
      './e.sh',
    ]);
    expect(commands(agent, { event: 'StopFailure', matcherValue: 'a rate-limit b' })).toEqual([
      './e.sh',
    ]);
  });
});
