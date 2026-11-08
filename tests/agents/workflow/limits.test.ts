/**
 * workflows.md § Behavior and limits: "No mid-run user input | A run pauses on its own only for agent
 * permission prompts and a usage-limit wait. For sign-off between stages, run each stage as its own
 * workflow"; "Up to 4,096 items in a single `parallel()` or `pipeline()` call: the runtime rejects a
 * longer list with an error"; "1,000 agents total per run | Prevents runaway loops"; "Up to 16
 * concurrent agents by default, fewer when Claude Code has fewer CPUs ... a value from 1 to 256"
 * (env-vars.md, `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`: "plain digits only; out-of-range values
 * and other spellings keep the default"). The wording of a refusal is the kit's judgment, tested
 * outside spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  FAN_OUT_CALLS,
  INTERRUPTIONS,
  admitAgent,
  checkFanOut,
  interruptRun,
  workflowConcurrency,
} from '../../../src/agents/workflow/index.ts';
import { spec } from '../../support/spec.ts';

spec('workflows.behavior.Behavior and limits.1,000 agents total per run', () => {
  test('the 1,000th agent starts, the 1,001st is refused', () => {
    expect(admitAgent(0)).toEqual({ admitted: true });
    expect(admitAgent(999)).toEqual({ admitted: true });
    const refused = admitAgent(1000);
    expect(refused.admitted).toBe(false);
    expect(refused.admitted ? undefined : refused.issue.severity).toBe('error');
    expect(admitAgent(1500).admitted).toBe(false);
  });

  test('the refusal names the cap and the count', () => {
    const refused = admitAgent(1000);
    expect(refused.admitted ? '' : refused.issue.message).toContain('1000');
  });
});

spec('workflows.behavior.Behavior and limits.parallel()', () => {
  test('4,096 items in one call run; 4,097 are rejected with an error, for parallel() and for pipeline()', () => {
    for (const call of FAN_OUT_CALLS) {
      expect(checkFanOut(call, 0)).toBeUndefined();
      expect(checkFanOut(call, 4096)).toBeUndefined();
      const issue = checkFanOut(call, 4097);
      expect(issue?.severity).toBe('error');
      expect(issue?.message).toContain(`${call}()`);
      expect(issue?.message).toContain('4096');
    }
  });

  test('the two calls the limit names are parallel() and pipeline()', () => {
    expect([...FAN_OUT_CALLS].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'parallel',
      'pipeline',
    ]);
  });
});

spec('workflows.behavior.Behavior and limits.No mid-run user input', () => {
  test('a run pauses on its own for an agent permission prompt and a usage-limit wait', () => {
    expect(interruptRun('agent-permission-prompt')).toEqual({ pauses: true });
    expect(interruptRun('usage-limit-wait')).toEqual({ pauses: true });
  });

  test('a question from the script and a sign-off between stages do not pause it: they are refused', () => {
    for (const cause of ['script-question', 'stage-sign-off'] as const) {
      const outcome = interruptRun(cause);
      expect(outcome.pauses).toBe(false);
      expect(outcome.pauses ? '' : outcome.issue.message).toContain(
        'each stage as its own workflow',
      );
    }
  });

  test('exactly two interruptions pause a run', () => {
    const pausing = INTERRUPTIONS.filter((cause) => interruptRun(cause).pauses);
    expect(pausing).toEqual(['agent-permission-prompt', 'usage-limit-wait']);
  });
});

describe('concurrent agents (no requirement id of its own)', () => {
  test('16 by default, fewer with fewer CPUs', () => {
    expect(workflowConcurrency({}, 64)).toBe(16);
    expect(workflowConcurrency({}, 4)).toBe(4);
    expect(workflowConcurrency({}, 0)).toBe(1);
  });

  test('the variable sets 1 to 256 in plain digits; anything else keeps the default', () => {
    const asked = (value: string) =>
      workflowConcurrency({ CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS: value }, 8);
    expect(asked('1')).toBe(1);
    expect(asked('256')).toBe(256);
    for (const value of ['0', '257', '-3', '4.5', ' 4', '0x10', '1e2', 'many', '']) {
      expect(asked(value)).toBe(8);
    }
  });

  test('judgment: an explicit value is not capped by the CPU count', () => {
    expect(workflowConcurrency({ CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS: '64' }, 2)).toBe(64);
  });
});
