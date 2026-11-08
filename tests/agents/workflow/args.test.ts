/**
 * workflows.md § Pass input to a saved workflow: "A saved workflow can accept input through the `args`
 * parameter. The script reads it as a global named `args`." The doc's example, `Run /triage-issues on
 * issues 1024, 1025, and 1030`: "Claude passes the list as structured data, so the script can call
 * array and object methods on `args` directly without parsing it first. If `args` is omitted, the
 * global is `undefined` inside the script." The refusal of values JSON cannot hold is a judgment, tested
 * outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { workflowArgs } from '../../../src/agents/workflow/index.ts';
import { inspectWorkflowScript } from '../../../src/format/workflow-script.ts';
import { spec } from '../../support/spec.ts';

spec('workflows.behavior.Pass input to a saved workflow', () => {
  test('the list of issue numbers arrives as a list, not as text to parse', () => {
    const { args, issues } = workflowArgs([1024, 1025, 1030]);
    expect(issues).toEqual([]);
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual([1024, 1025, 1030]);
    expect(Array.isArray(args) && args.map((n) => n)).toEqual([1024, 1025, 1030]);
  });

  test('an object stays an object with its own members, nested data included', () => {
    const passed = { question: 'why is login slow?', paths: ['src/a.ts', 'src/b.ts'], limit: 3 };
    expect(workflowArgs(passed)).toEqual({ args: passed, issues: [] });
  });

  test('a string stays one string: it is not parsed as JSON or split', () => {
    expect(workflowArgs('1024, 1025, 1030').args).toBe('1024, 1025, 1030');
    expect(workflowArgs('[1,2]').args).toBe('[1,2]');
  });

  test('a falsy value is still a value: 0, false, an empty string and null are passed as they are', () => {
    for (const value of [0, false, '', null]) {
      expect(workflowArgs(value)).toEqual({ args: value, issues: [] });
    }
  });

  test('omitted, the global is undefined', () => {
    expect(workflowArgs(undefined)).toEqual({ args: undefined, issues: [] });
  });

  test('a script that reads args is found as one that takes input', () => {
    const source =
      "export const meta = { name: 'triage-issues', description: 'Triage issues' }\nreturn args.map(n => agent(`Triage issue ${n}`))\n";
    expect(inspectWorkflowScript(source).readsArgs).toBe(true);
  });
});

describe('judgment: input JSON cannot hold', () => {
  test('a member that is a function is left out, as JSON writes the object', () => {
    expect(workflowArgs({ keep: 1, drop: () => 1 })).toEqual({ args: { keep: 1 }, issues: [] });
  });

  test('a function, a cycle and a bigint cannot cross into the isolated runtime: refused, with args left undefined', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    for (const value of [() => 1, cycle, 10n, { nested: 10n }]) {
      const result = workflowArgs(value);
      expect(result.args).toBeUndefined();
      expect(result.issues.map((issue) => issue.severity)).toEqual(['error']);
    }
  });
});
