/**
 * permissions.md § Manage permissions: "Rules are evaluated in order: deny, then ask, then allow.
 * The first match in that order determines the outcome, and rule specificity doesn't change the
 * order." and the two examples after it ("A broad deny rule … blocks every matching call, including
 * calls that also match a narrower allow rule"; "a matching ask rule prompts even when a more
 * specific allow rule also matches").
 *
 * tools-reference.md § Configure tools with permission rules and hooks: the "Rule format" table
 * says which tools read what follows the tool name as a command, a path, a skill, a subagent or a
 * domain pattern; the dispatch test checks the rule goes to the matcher of its tool's format.
 *
 * No requirement id covers these sections, so none of it is under spec(). The Bash, path and domain
 * matchers have their own sub-packages: the examples here use whole-tool and parameter rules.
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import {
  evaluateRules,
  matchRule,
  type PermissionRule,
  type RuleFormatId,
  type SpecifierMatchers,
} from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';

const verdict = (rules: readonly PermissionRule[], toolName: string, input: unknown = {}) =>
  evaluateRules(rules, call(toolName, input), matchContext);

describe('evaluateRules: deny, then ask, then allow', () => {
  test('a broad deny beats a narrower allow that also matches', () => {
    const rules = [parsed('mcp__github__get_*', 'allow'), parsed('mcp__*', 'deny')];
    const result = verdict(rules, 'mcp__github__get_issue');
    expect(result.behavior).toBe('deny');
    expect(result.rule).toBe(rules[1]);
  });

  test('a matching ask rule prompts even when a more specific allow rule matches', () => {
    const rules = [parsed('mcp__github__get_issue', 'allow'), parsed('mcp__*', 'ask')];
    expect(verdict(rules, 'mcp__github__get_issue').behavior).toBe('ask');
  });

  test('deny beats ask beats allow, whatever order the rules were written in', () => {
    const allow = parsed('Agent', 'allow');
    const ask = parsed('Agent(model:*)', 'ask');
    const deny = parsed('Agent(model:opus)', 'deny');
    const input = { model: 'opus' };
    const orders = [
      [allow, ask, deny],
      [deny, ask, allow],
      [ask, allow, deny],
      [ask, deny, allow],
    ];
    for (const order of orders) expect(verdict(order, 'Agent', input).rule).toBe(deny);
    for (const order of orders) {
      expect(
        verdict(
          order.filter((rule) => rule !== deny),
          'Agent',
          input,
        ).rule,
      ).toBe(ask);
    }
    expect(verdict([allow], 'Agent', input).rule).toBe(allow);
  });

  test('rule specificity does not change the order: a bare deny beats a param ask', () => {
    const rules = [parsed('Agent(model:opus)', 'ask'), parsed('Agent', 'deny')];
    expect(verdict(rules, 'Agent', { model: 'opus' }).behavior).toBe('deny');
  });

  test('within a behaviour the first matching rule is the one reported', () => {
    const first = parsed('Agent(model:opus)', 'deny');
    const second = parsed('Agent(model:*)', 'deny');
    expect(verdict([first, second], 'Agent', { model: 'opus' }).rule).toBe(first);
    expect(verdict([second, first], 'Agent', { model: 'opus' }).rule).toBe(second);
  });

  test('a rule that does not match the call is passed over', () => {
    const rules = [parsed('Agent(model:opus)', 'deny'), parsed('Read', 'allow')];
    expect(verdict(rules, 'Agent', { model: 'sonnet' })).toEqual({ behavior: undefined });
    expect(verdict(rules, 'Read').behavior).toBe('allow');
  });

  test('no rules, no verdict', () => {
    expect(verdict([], 'Bash', { command: 'ls' })).toEqual({ behavior: undefined });
  });

  test('the verdict carries the behaviour of the rule that matched', () => {
    for (const behavior of ['deny', 'ask', 'allow'] as const satisfies PermissionBehavior[]) {
      expect(verdict([parsed('Read', behavior)], 'Read').behavior).toBe(behavior);
    }
  });
});

/** A registry whose every matcher records its own format and says yes. */
const recording = (seen: RuleFormatId[]): SpecifierMatchers => {
  const say = (format: RuleFormatId) => () => {
    seen.push(format);
    return true;
  };
  return {
    command: say('command'),
    'powershell-command': say('powershell-command'),
    'read-path': say('read-path'),
    'edit-path': say('edit-path'),
    'skill-name': say('skill-name'),
    'subagent-type': say('subagent-type'),
    domain: say('domain'),
    bare: say('bare'),
  };
};

// Hand-copied from the "Rule format" table of tools-reference.md.
const table: readonly (readonly [string, string, RuleFormatId])[] = [
  ['Bash', 'Bash(npm run *)', 'command'],
  ['Monitor', 'Monitor(npm run *)', 'command'],
  ['PowerShell', 'PowerShell(Get-ChildItem *)', 'powershell-command'],
  ['Read', 'Read(~/secrets/**)', 'read-path'],
  ['Grep', 'Grep(~/secrets/**)', 'read-path'],
  ['Glob', 'Glob(~/secrets/**)', 'read-path'],
  ['LSP', 'LSP(~/secrets/**)', 'read-path'],
  ['Edit', 'Edit(/src/**)', 'edit-path'],
  ['Write', 'Write(/src/**)', 'edit-path'],
  ['NotebookEdit', 'NotebookEdit(/src/**)', 'edit-path'],
  ['Skill', 'Skill(deploy *)', 'skill-name'],
  ['Agent', 'Agent(Explore)', 'subagent-type'],
  ['WebFetch', 'WebFetch(domain:example.com)', 'domain'],
  ['WebSearch', 'WebSearch(anything)', 'bare'],
];

describe('matchRule dispatches a specifier to the matcher of its tool format', () => {
  test('each tool of the table reaches the matcher of its format', () => {
    for (const [toolName, text, format] of table) {
      const seen: RuleFormatId[] = [];
      const rule = parsed(text, 'allow');
      const matched = matchRule(rule, call(toolName, {}), matchContext, recording(seen));
      expect([toolName, matched, seen]).toEqual([toolName, true, [format]]);
    }
  });

  test('a rule for another tool never reaches a matcher', () => {
    const seen: RuleFormatId[] = [];
    const rule = parsed('Bash(npm run *)', 'allow');
    expect(matchRule(rule, call('Read', {}), matchContext, recording(seen))).toBe(false);
    expect(seen).toEqual([]);
  });

  test('a bare rule and a parameter rule never reach a matcher: the tool name and input decide', () => {
    const seen: RuleFormatId[] = [];
    const matchers = recording(seen);
    expect(matchRule(parsed('Bash'), call('Bash', {}), matchContext, matchers)).toBe(true);
    const param = parsed('Bash(timeout:5)');
    expect(matchRule(param, call('Bash', { timeout: 5 }), matchContext, matchers)).toBe(true);
    expect(seen).toEqual([]);
  });

  test('a tool the table does not list reads a specifier as the bare format does', () => {
    const seen: RuleFormatId[] = [];
    const rule = parsed('TodoWrite(anything)', 'allow');
    expect(matchRule(rule, call('TodoWrite', {}), matchContext, recording(seen))).toBe(true);
    expect(seen).toEqual(['bare']);
  });
});
