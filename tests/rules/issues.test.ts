/**
 * permissions.md § Match all uses of a tool (labels such as `Stop Task` do not match; "For deny and
 * ask rules, a startup warning says so") and § Tool name wildcards ("A deny or ask rule whose tool
 * name matches no known tool produces a startup warning to catch typos. Tool names containing `_`
 * or `*` are exempt from the check, and so are the names of tools Claude Code has removed, such as
 * `TaskOutput`"); errors.md § Matches no tool (the quoted warning).
 *
 * The rows of the tools table have their own ids (`tools.tool.*`), proven with the tool catalog;
 * this file proves the warning itself, so it is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import type { PermissionBehavior } from '../../src/protocol/official.ts';
import { DOCUMENTED_TOOLS } from '../../src/protocol/tool-names.ts';
import { ruleIssues } from '../../src/rules/index.ts';
import { parsed } from '../support/rule-context.ts';

const known: ReadonlySet<string> = new Set(DOCUMENTED_TOOLS);
const issuesOf = (text: string, behavior: PermissionBehavior) =>
  ruleIssues([parsed(text, behavior, { kind: 'user' })], known);

describe('ruleIssues: a deny or ask rule that matches no tool', () => {
  test('a typo warns, in the words the docs quote for stderr', () => {
    expect(issuesOf('Bsh', 'deny')).toEqual([
      {
        severity: 'warning',
        path: 'permissions.deny',
        message: 'Permission deny rule "Bsh" matches no known tool — check for typos.',
      },
    ]);
    expect(issuesOf('Grpe', 'ask')[0]?.message).toBe(
      'Permission ask rule "Grpe" matches no known tool — check for typos.',
    );
  });

  test('the warning repeats the rule as written, specifier included', () => {
    expect(issuesOf('Bsh(rm *)', 'deny')[0]?.message).toContain('"Bsh(rm *)"');
  });

  test('a label is not a canonical name: "Stop Task" warns, TaskStop does not', () => {
    expect(issuesOf('Stop Task', 'deny')).toHaveLength(1);
    expect(issuesOf('Stop Task', 'ask')).toHaveLength(1);
    expect(issuesOf('TaskStop', 'deny')).toEqual([]);
  });

  test('every documented tool name is known', () => {
    for (const name of DOCUMENTED_TOOLS) expect([name, issuesOf(name, 'deny')]).toEqual([name, []]);
  });

  test('names are case-sensitive: bash is not Bash', () => {
    expect(issuesOf('bash', 'deny')).toHaveLength(1);
  });

  test('a name containing _ or * is exempt', () => {
    for (const name of ['mcp__github__get_issue', 'mcp__*', '*', 'Ba*', 'my_tool']) {
      expect([name, issuesOf(name, 'deny')]).toEqual([name, []]);
    }
  });

  test('a tool Claude Code removed is exempt: TaskOutput', () => {
    expect(issuesOf('TaskOutput', 'deny')).toEqual([]);
    expect(issuesOf('TaskOutput', 'ask')).toEqual([]);
  });

  test('an allow rule gets no such warning', () => {
    expect(issuesOf('Bsh', 'allow')).toEqual([]);
    expect(issuesOf('Stop Task', 'allow')).toEqual([]);
  });

  test('each offending rule is reported once, the others are not', () => {
    const rules = [
      parsed('Bsh', 'deny'),
      parsed('Bash', 'deny'),
      parsed('Stop Task', 'ask'),
      parsed('Read', 'allow'),
    ];
    expect(ruleIssues(rules, known).map((found) => found.path)).toEqual([
      'permissions.deny',
      'permissions.ask',
    ]);
  });
});
