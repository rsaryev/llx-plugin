/**
 * permissions.md § Match by input parameter: the primary content field of each tool ("`command` for
 * Bash and PowerShell, `file_path` for Read, Edit, and Write, `path` for Grep and Glob,
 * `notebook_path` for NotebookEdit, and `url` for WebFetch") and the `Skill(skill:<name>)` deny
 * rule; skills.md § Restrict Claude's skill access. No requirement id covers either, so none of it
 * is under spec(); where the docs are silent the choice is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { matchRule, parseRule } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';

const matches = (ruleText: string, toolName: string, input: unknown) =>
  matchRule(parsed(ruleText), call(toolName, input), matchContext);

describe('the primary content field is per tool (permissions.md § Match by input parameter)', () => {
  // The docs list one field per tool; the same name on another tool is an ordinary parameter.
  test('a primary field of one tool is an ordinary parameter rule on another', () => {
    const others = [
      ['Grep(file_path:x)', 'Grep', { pattern: 'a', file_path: 'x' }],
      ['Glob(file_path:x)', 'Glob', { pattern: 'a', file_path: 'x' }],
      ['Read(path:/etc)', 'Read', { file_path: '/a', path: '/etc' }],
      ['Read(url:x)', 'Read', { file_path: '/a', url: 'x' }],
      ['Edit(path:x)', 'Edit', { file_path: '/a', path: 'x' }],
      ['WebFetch(path:x)', 'WebFetch', { url: 'https://a.b', path: 'x' }],
      ['NotebookEdit(file_path:x)', 'NotebookEdit', { file_path: 'x' }],
    ] as const;
    for (const [text, toolName, input] of others) {
      const { rule, issues } = parseRule(text, { behavior: 'deny', source: { kind: 'user' } });
      expect([text, issues]).toEqual([text, []]);
      expect([text, rule?.specifier?.form]).toEqual([text, 'param']);
      expect([text, matches(text, toolName, input)]).toEqual([text, true]);
    }
  });

  test('the rule on a tool own primary field is still ignored', () => {
    for (const text of ['Grep(path:/etc)', 'Read(file_path:/a)', 'WebFetch(url:https://a.b)']) {
      const { rule, issues } = parseRule(text, { behavior: 'deny', source: { kind: 'user' } });
      expect([text, rule]).toEqual([text, undefined]);
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
    }
  });

  test('Monitor is not in the docs list, so its command field is an ordinary parameter', () => {
    // Judgment: the docs name the primary fields of Bash and PowerShell, not of Monitor.
    expect(parsed('Monitor(command:tail -f x)').specifier?.form).toBe('param');
  });
});

describe('Skill(skill:<name>) (permissions.md § Match by input parameter; skills.md § Restrict Claude skill access)', () => {
  const names = ['code-review', 'review', 'Code Review'];
  const invoked = (skill: string): ReturnType<typeof call> => ({
    toolName: 'Skill',
    input: { skill },
    skillNames: names,
  });

  test('a deny rule matches the skill under any of the names the host reports', () => {
    for (const name of names) {
      const rule = parsed(`Skill(skill:${name})`, 'deny');
      expect([name, matchRule(rule, invoked('code-review'), matchContext)]).toEqual([name, true]);
    }
  });

  test('it matches the literal input too, and a wildcard value reads the names the same way', () => {
    expect(matches('Skill(skill:deploy)', 'Skill', { skill: 'deploy' })).toBe(true);
    expect(matchRule(parsed('Skill(skill:Code*)'), invoked('code-review'), matchContext)).toBe(
      true,
    );
  });

  test('a name the skill does not go by does not match', () => {
    expect(matchRule(parsed('Skill(skill:deploy)'), invoked('code-review'), matchContext)).toBe(
      false,
    );
  });

  test('without names from the host only the literal input counts', () => {
    const bare = call('Skill', { skill: 'code-review' });
    expect(matchRule(parsed('Skill(skill:review)'), bare, matchContext)).toBe(false);
  });

  test('only a deny rule widens to every name: an ask rule matches the literal input', () => {
    // Judgment: the docs say "deny rule"; a rule of another behaviour keeps the generic path.
    const ask = parsed('Skill(skill:review)', 'ask');
    expect(matchRule(ask, invoked('code-review'), matchContext)).toBe(false);
    expect(matchRule(ask, invoked('review'), matchContext)).toBe(true);
  });

  test('another tool with a skill field gets no alias matching', () => {
    const other = { toolName: 'Agent', input: { skill: 'code-review' }, skillNames: names };
    expect(matchRule(parsed('Agent(skill:review)'), other, matchContext)).toBe(false);
  });
});
