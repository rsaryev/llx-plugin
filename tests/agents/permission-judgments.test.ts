/**
 * Judgments (spec/judgments.md) of the permission-mode resolution: where the docs are silent the
 * kit decides, and says so. Not under spec(): never counted as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { baselineDecision } from '../../src/agents/permission-baseline.ts';
import {
  resolveSubagentPermissionMode,
  type SubagentPermissionInput,
} from '../../src/agents/subagent-permission.ts';

describe('a permissionMode that is no mode counts as unset', () => {
  test('the subagent inherits the main conversation mode', () => {
    // A host passing raw text: readAgent already drops such a value with a warning.
    const input: SubagentPermissionInput = JSON.parse(
      '{"main":"default","set":"yolo","autoAvailable":true}',
    );
    expect(resolveSubagentPermissionMode(input)).toEqual({
      mode: 'default',
      denyInsteadOfAsk: false,
      basis: 'inherited',
    });
  });
});

describe('the baseline ignores scope where the table names none', () => {
  test('a read in default mode is allowed in or out of scope', () => {
    const outside = baselineDecision('default', { category: 'read', inScope: false });
    expect(outside).toBe('allow');
  });

  test('a read in auto mode is allowed: the first read outside is session state, not modelled', () => {
    expect(baselineDecision('auto', { category: 'read', inScope: false })).toBe('allow');
  });
});

describe('an agent team teammate is not resolved here', () => {
  test('the plan rule applies to a subagent; a teammate follows the agent teams rules of its host', () => {
    // The function has no teammate input: it answers for subagents only.
    expect(
      resolveSubagentPermissionMode({ main: 'plan', set: 'default', autoAvailable: true }).mode,
    ).toBe('plan');
  });
});
