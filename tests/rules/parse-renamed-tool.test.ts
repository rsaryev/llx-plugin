/**
 * sub-agents.md § Restrict which subagents can be spawned: "In version 2.1.63, the Task tool was
 * renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as
 * aliases."
 */
import { expect, test } from 'bun:test';
import { matchRule, parseRule } from '../../src/rules/index.ts';
import { call, matchContext } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const read = (text: string) => parseRule(text, { behavior: 'deny', source: { kind: 'project' } });

spec(['agents.behavior.Restrict which subagents can be spawned'], () => {
  test('a Task rule is an Agent rule, its text as written', () => {
    const { rule } = read('Task(Explore)');
    expect(rule?.value).toEqual({ toolName: 'Agent', ruleContent: 'Explore' });
    expect(rule?.text).toBe('Task(Explore)');
  });

  test('a bare Task rule covers every Agent call', () => {
    const { rule } = read('Task');
    expect(rule?.value.toolName).toBe('Agent');
    expect(rule && matchRule(rule, call('Agent', { subagent_type: 'Plan' }), matchContext)).toBe(
      true,
    );
  });

  test('a name that only starts with Task is left alone', () => {
    expect(read('TaskStop').rule?.value.toolName).toBe('TaskStop');
  });
});
