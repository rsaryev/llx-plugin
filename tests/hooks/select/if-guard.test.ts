/**
 * hooks.md § Common fields (`if`): "Permission rule syntax to filter when this hook runs ... Only
 * evaluated on tool events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`,
 * and `PermissionDenied`. On other events, a hook with `if` set never runs"; § How a hook resolves
 * (`Bash(rm *)` against `rm -rf /tmp/build` and `npm test`), "The `if` field is optional; without
 * it, every handler in the matched group runs"; "`Edit(*.ts)` runs only for TypeScript files". The
 * Bash table itself is proven where `evaluateIf` lives (tests/rules/bash-if.test.ts).
 */
import { describe, expect, test } from 'bun:test';
import { guardWithIf } from '../../../src/hooks/select/if-guard.ts';
import { HOOK_EVENTS } from '../../../src/protocol/hook-events.ts';
import { spec } from '../../support/spec.ts';
import { command, entry, FACTS, select } from '../../support/hooks-select.ts';

const TOOL_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
] as const;

const withIf = (rule: string) => ({ ...command(), if: rule });

const runsFor = (
  event: (typeof TOOL_EVENTS)[number],
  rule: string,
  toolName: string,
  input: unknown,
): boolean =>
  select([entry(event, { handler: withIf(rule) })], event, {
    ...FACTS[event],
    tool_name: toolName,
    tool_input: input,
  }).selected.length === 1;

const editRuns = (rule: string, path: string): boolean =>
  runsFor('PostToolUse', rule, 'Edit', { file_path: path });

const joinedRules = (rule: string, input: unknown) =>
  select([entry('PreToolUse', { handler: withIf(rule) })], 'PreToolUse', {
    ...FACTS.PreToolUse,
    tool_input: input,
  });

spec('hooks.handler.common.if', () => {
  test('`Bash(rm *)` runs for `rm -rf /tmp/build` and not for `npm test`', () => {
    for (const event of TOOL_EVENTS) {
      expect(runsFor(event, 'Bash(rm *)', 'Bash', { command: 'rm -rf /tmp/build' })).toBe(true);
      expect(runsFor(event, 'Bash(rm *)', 'Bash', { command: 'npm test' })).toBe(false);
    }
  });

  test('`Bash(git *)` runs when any subcommand matches', () => {
    expect(runsFor('PreToolUse', 'Bash(git *)', 'Bash', { command: 'npm test && git push' })).toBe(
      true,
    );
  });

  test('`Edit(*.ts)` runs only for TypeScript files', () => {
    expect(runsFor('PostToolUse', 'Edit(*.ts)', 'Edit', { file_path: '/work/app/a.ts' })).toBe(
      true,
    );
    expect(runsFor('PostToolUse', 'Edit(*.ts)', 'Edit', { file_path: '/work/app/a.md' })).toBe(
      false,
    );
  });

  test('`Edit(src/**)` matches only the `src` directory in the working directory, not a nested one', () => {
    expect(editRuns('Edit(src/**)', '/work/app/src/a.ts')).toBe(true);
    expect(editRuns('Edit(src/**)', '/work/app/src/deep/a.ts')).toBe(true);
    expect(editRuns('Edit(src/**)', '/work/app/lib/src/a.ts')).toBe(false);
  });

  test('`Edit(**/src/**)` matches a directory named `src` at any depth', () => {
    expect(editRuns('Edit(**/src/**)', '/work/app/src/a.ts')).toBe(true);
    expect(editRuns('Edit(**/src/**)', '/work/app/lib/src/a.ts')).toBe(true);
    expect(editRuns('Edit(**/src/**)', '/work/app/lib/other/a.ts')).toBe(false);
  });

  test('a rule for another tool does not run for this call', () => {
    expect(runsFor('PreToolUse', 'Edit(*.ts)', 'Bash', { command: 'rm -rf /tmp/build' })).toBe(
      false,
    );
  });

  test('without `if`, every handler of the matched group runs', () => {
    const handlers = [
      entry('PreToolUse', { handler: command('./a.sh') }),
      entry('PreToolUse', { handler: command('./b.sh') }),
    ];
    expect(select(handlers, 'PreToolUse', FACTS.PreToolUse).selected).toEqual(handlers);
  });

  test('on every event but the five tool events, a hook with `if` set never runs', () => {
    for (const event of HOOK_EVENTS.filter((each) => !TOOL_EVENTS.some((tool) => tool === each))) {
      const registered = entry(event, { handler: withIf('Bash(rm *)') });
      expect(select([registered], event, FACTS[event]).selected).toEqual([]);
    }
  });

  test('even an `if` that names a tool (Bash) does not run on a non-tool event', () => {
    const registered = entry('UserPromptSubmit', { handler: withIf('Bash') });
    expect(select([registered], 'UserPromptSubmit', FACTS.UserPromptSubmit).selected).toEqual([]);
  });

  test('when the commands cannot be determined the hook runs regardless of the pattern', () => {
    expect(runsFor('PreToolUse', 'Bash(git push *)', 'Bash', { command: 'echo $(date)' })).toBe(
      true,
    );
    expect(runsFor('PreToolUse', 'Bash(rm *)', 'Bash', { command: 'echo $(date)' })).toBe(false);
  });
});

describe('judgment: `if` holds exactly one rule', () => {
  test('`&&` and `||` do not combine rules: the text is one rule that matches nothing, and a warning says so', () => {
    for (const rule of ['Bash(rm *) && Bash(git *)', 'Bash(rm *) || Bash(git *)']) {
      for (const cmd of ['npm test', 'rm -rf /tmp/build', 'git push']) {
        const result = joinedRules(rule, { command: cmd });
        expect(result.selected).toEqual([]);
        expect(result.issues).toEqual([
          expect.objectContaining({ severity: 'warning', path: 'hooks.PreToolUse[0].if' }),
        ]);
      }
    }
  });

  test('a single rule, even one with parentheses in its pattern, reports nothing', () => {
    expect(joinedRules('Bash(rm *)', { command: 'rm x' }).issues).toEqual([]);
    expect(joinedRules('Bash(echo (a))', { command: 'echo (a)' }).issues).toEqual([]);
  });
});

describe('judgment: what the kit does with an `if` it cannot evaluate', () => {
  test('without an evaluator the handler runs and a warning at hooks.<Event>[i].if says the filter does not apply', () => {
    const registered = entry('PreToolUse', { handler: withIf('Bash(rm *)') });
    const call = { toolName: 'Bash', toolInput: { command: 'npm test' } };
    const result = guardWithIf(
      registered,
      { call, monitor: undefined, evaluate: undefined },
      'hooks.PreToolUse[0]',
    );
    expect(result.runs).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', path: 'hooks.PreToolUse[0].if' }),
    ]);
  });

  test('a rule that does not parse runs the handler and the issue is reported at the handler', () => {
    const registered = entry('PreToolUse', { handler: withIf('Bash(') });
    const result = select([registered], 'PreToolUse', FACTS.PreToolUse);
    expect(result.selected).toEqual([registered]);
    expect(result.issues[0]?.path).toBe('hooks.PreToolUse[0].if');
  });
});
