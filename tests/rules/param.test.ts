/**
 * permissions.md § Match by input parameter: `Tool(param:value)` in deny and ask rules. The doc's
 * own examples (`Agent(model:opus)`, `Agent(isolation:worktree)`, `Bash(run_in_background:true)`)
 * and every bullet of "Parameter matching follows these rules" are asserted as behaviour: what
 * `matchRule` does with a call, and what `parseRule` does with a rule it must ignore.
 *
 * Where the section is silent (how a number or boolean compares, what a rule on an allow list
 * means for a command tool) the test sits outside spec() and the choice is a row in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { evaluateRules, matchRule, parseRule, type RuleFormatId } from '../../src/rules/index.ts';
import { call, matchContext, parsed, recordingMatchers } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

const matches = (
  ruleText: string,
  toolName: string,
  input: unknown,
  behavior: PermissionBehavior = 'deny',
) => matchRule(parsed(ruleText, behavior), call(toolName, input), matchContext);

spec('permissions.rule.Agent(model:opus)', () => {
  test('matches an Agent call that requests the opus alias', () => {
    expect(matches('Agent(model:opus)', 'Agent', { model: 'opus', prompt: 'x' })).toBe(true);
  });

  test('works as an ask rule too', () => {
    expect(matches('Agent(model:opus)', 'Agent', { model: 'opus' }, 'ask')).toBe(true);
  });

  test('is exact: other tiers and a full model ID do not match', () => {
    for (const model of ['sonnet', 'haiku', 'opusx', 'claude-opus-4-1-20250805']) {
      expect(matches('Agent(model:opus)', 'Agent', { model })).toBe(false);
    }
  });

  test('compares the literal input, not a normalised model name', () => {
    expect(matches('Agent(model:claude-opus-4-1-20250805)', 'Agent', { model: 'opus' })).toBe(
      false,
    );
  });

  test('never matches a call that leaves the parameter out', () => {
    expect(matches('Agent(model:opus)', 'Agent', { prompt: 'x' })).toBe(false);
    expect(matches('Agent(model:*)', 'Agent', { prompt: 'x' })).toBe(false);
  });

  test('only matches the tool it names', () => {
    expect(matches('Agent(model:opus)', 'Bash', { model: 'opus' })).toBe(false);
  });

  test('a * in the value matches any sequence of characters', () => {
    expect(matches('Agent(model:*)', 'Agent', { model: 'sonnet' })).toBe(true);
    expect(matches('Agent(model:claude-*)', 'Agent', { model: 'claude-opus-4-1' })).toBe(true);
    expect(matches('Agent(model:claude-*)', 'Agent', { model: 'opus' })).toBe(false);
    expect(matches('Agent(model:*-4-*)', 'Agent', { model: 'claude-opus-4-1' })).toBe(true);
  });

  test('a regular-expression character in the value is literal', () => {
    expect(matches('Agent(model:o.us)', 'Agent', { model: 'opus' })).toBe(false);
    expect(matches('Agent(model:o.us)', 'Agent', { model: 'o.us' })).toBe(true);
  });
});

spec('permissions.rule.Agent(isolation:worktree)', () => {
  test('matches an Agent call that requests a git worktree', () => {
    expect(matches('Agent(isolation:worktree)', 'Agent', { isolation: 'worktree' })).toBe(true);
    expect(matches('Agent(isolation:worktree)', 'Agent', { isolation: 'remote' })).toBe(false);
  });

  test('Agent(isolation:*) matches any explicit isolation value, not an unset one', () => {
    expect(matches('Agent(isolation:*)', 'Agent', { isolation: 'worktree' })).toBe(true);
    expect(matches('Agent(isolation:*)', 'Agent', { isolation: 'anything' })).toBe(true);
    expect(matches('Agent(isolation:*)', 'Agent', { prompt: 'x' })).toBe(false);
  });

  test('the parameter must be a direct field: a nested one is not matchable', () => {
    const nested = { options: { isolation: 'worktree' } };
    expect(matches('Agent(isolation:worktree)', 'Agent', nested)).toBe(false);
    expect(matches('Agent(options:*)', 'Agent', nested)).toBe(false);
  });

  test('a dotted path is not a parameter name, so there is no nested-field rule to write', () => {
    // The rule reads as a text specifier for the agent type; nothing digs into `options`.
    expect(parsed('Agent(options.isolation:worktree)').specifier).toEqual({
      form: 'text',
      pattern: 'options.isolation:worktree',
    });
  });

  test('a field inside an array is not matchable either', () => {
    expect(matches('Agent(tags:*)', 'Agent', { tags: ['worktree'] })).toBe(false);
    expect(matches('Agent(tags:worktree)', 'Agent', { tags: ['worktree'] })).toBe(false);
  });

  test('to gate on both, two rules cover each parameter on its own', () => {
    const rules = [parsed('Agent(model:opus)'), parsed('Agent(isolation:worktree)')];
    const byModel = evaluateRules(rules, call('Agent', { model: 'opus' }), matchContext);
    const byIsolation = evaluateRules(
      rules,
      call('Agent', { isolation: 'worktree' }),
      matchContext,
    );
    expect(byModel.rule).toBe(rules[0]);
    expect(byIsolation.rule).toBe(rules[1]);
    expect(evaluateRules(rules, call('Agent', { model: 'haiku' }), matchContext).behavior).toBe(
      undefined,
    );
  });

  test('whitespace around the colon is ignored', () => {
    for (const text of [
      'Agent(isolation : worktree)',
      'Agent(isolation: worktree)',
      'Agent(isolation :worktree)',
      'Agent( isolation:worktree )',
    ]) {
      expect(matches(text, 'Agent', { isolation: 'worktree' })).toBe(true);
    }
  });
});

spec('permissions.rule.Bash(run_in_background:true)', () => {
  test('matches Bash calls that run in the background', () => {
    expect(
      matches('Bash(run_in_background:true)', 'Bash', {
        command: 'npm run dev',
        run_in_background: true,
      }),
    ).toBe(true);
  });

  test('does not match a foreground call, set or unset', () => {
    expect(
      matches('Bash(run_in_background:true)', 'Bash', { command: 'ls', run_in_background: false }),
    ).toBe(false);
    expect(matches('Bash(run_in_background:true)', 'Bash', { command: 'ls' })).toBe(false);
  });

  test('is a parameter rule, so it never looks at the command text', () => {
    const rule = parsed('Bash(run_in_background:true)');
    expect(rule.specifier).toEqual({ form: 'param', name: 'run_in_background', value: 'true' });
  });

  test('a rule on the primary content field is ignored with a warning', () => {
    const { rule, issues } = parseRule('Bash(command:rm *)', {
      behavior: 'deny',
      source: { kind: 'project' },
    });
    expect(rule).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('Bash(command:rm *)');
    expect(issues[0]?.message).toContain('primary content field');
    expect(issues[0]?.message).toContain('Bash(rm *)');
  });

  test('every primary content field of the section is ignored the same way', () => {
    const primary = [
      'Bash(command:ls)',
      'PowerShell(command:ls)',
      'Read(file_path:/etc/hosts)',
      'Edit(file_path:/etc/hosts)',
      'Write(file_path:/etc/hosts)',
      'Grep(path:/etc)',
      'Glob(path:/etc)',
      'NotebookEdit(notebook_path:/a.ipynb)',
      'WebFetch(url:https://example.com)',
    ];
    for (const text of primary) {
      const { rule, issues } = parseRule(text, { behavior: 'ask', source: { kind: 'project' } });
      expect([text, rule]).toEqual([text, undefined]);
      expect(issues.map((found) => found.severity)).toEqual(['warning']);
    }
  });

  test('an allow rule does not read a parameter: allow keeps each tool own specifier syntax', () => {
    const rule = parsed('Bash(run_in_background:true)', 'allow');
    expect(rule.specifier).toEqual({ form: 'text', pattern: 'run_in_background:true' });
    // The rule goes to the command matcher as command text, never to parameter matching.
    const seen: RuleFormatId[] = [];
    const matchers = recordingMatchers(seen);
    const background = call('Bash', { command: 'ls', run_in_background: true });
    expect(matchRule(rule, background, matchContext, matchers)).toBe(true);
    expect(seen).toEqual(['command']);
  });
});

describe('judgments (spec/judgments.md: how a parameter value is compared)', () => {
  test('a rule that names two parameters reads them as one value and matches neither call shape', () => {
    // The docs only say to write two rules "rather than combining them in one rule"; what a
    // combined rule does is the kit's choice: `name:value` splits at the first colon, so the rest
    // is one literal value.
    const both = { model: 'opus', isolation: 'worktree' };
    expect(parsed('Agent(model:opus, isolation:worktree)').specifier).toEqual({
      form: 'param',
      name: 'model',
      value: 'opus, isolation:worktree',
    });
    expect(matches('Agent(model:opus, isolation:worktree)', 'Agent', both)).toBe(false);
    expect(matches('Agent(model:opus isolation:worktree)', 'Agent', both)).toBe(false);
  });

  test('a number or boolean compares as its text', () => {
    expect(matches('Bash(timeout:5000)', 'Bash', { command: 'ls', timeout: 5000 })).toBe(true);
    expect(matches('Bash(timeout:5000)', 'Bash', { command: 'ls', timeout: 5001 })).toBe(false);
    expect(matches('Read(limit:*)', 'Read', { file_path: '/a', limit: 5 })).toBe(true);
  });

  test('an object, an array or null never matches, even for a bare *', () => {
    for (const value of [{ a: 1 }, ['x'], null, undefined]) {
      expect(matches('Agent(model:*)', 'Agent', { model: value })).toBe(false);
    }
  });

  test('an inherited property is not a field of the input', () => {
    expect(matches('Agent(toString:*)', 'Agent', {})).toBe(false);
    expect(matches('Agent(constructor:*)', 'Agent', {})).toBe(false);
  });

  test('an input that is not an object matches nothing', () => {
    for (const input of [undefined, null, 'opus', 3, ['opus']]) {
      expect(matches('Agent(model:*)', 'Agent', input)).toBe(false);
    }
  });

  test('a command tool reads name:value as a parameter only for a field of its input', () => {
    expect(parsed('Bash(timeout:5000)').specifier?.form).toBe('param');
    expect(parsed('Bash(git:* push)').specifier).toEqual({ form: 'text', pattern: 'git:* push' });
    expect(parsed('Bash(npm:run)').specifier).toEqual({ form: 'text', pattern: 'npm:run' });
  });

  test('the :* suffix of a command rule stays a command prefix, never a parameter', () => {
    expect(parsed('Bash(ls:*)').specifier).toEqual({ form: 'text', pattern: 'ls:*' });
    expect(parsed('Bash(description:*)').specifier).toEqual({
      form: 'text',
      pattern: 'description:*',
    });
  });

  test('a Windows drive letter is a path, not a parameter name', () => {
    expect(parsed('Read(C:\\Users\\alice\\.env)').specifier).toEqual({
      form: 'text',
      pattern: 'C:\\Users\\alice\\.env',
    });
  });

  test('a Grep flag such as -i is a parameter name', () => {
    expect(matches('Grep(-i:true)', 'Grep', { pattern: 'x', '-i': true })).toBe(true);
  });
});
