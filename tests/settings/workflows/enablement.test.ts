/**
 * settings-reference.md § `disableWorkflows` (Scope "Any file"; `true` turns off dynamic workflows
 * and the bundled workflow commands "for everyone your settings reach"; `false` "the same as unset;
 * whether workflows are on then follows `enableWorkflows` and your plan's default"; per-session
 * override `CLAUDE_CODE_DISABLE_WORKFLOWS`: "whichever of the two turns them off, the other can't
 * turn them back on"), § `enableWorkflows` ("unset, so workflows are on unless you're on the Pro
 * plan, where they're off"; "`enableWorkflows: true` can't turn workflows back on while any source
 * turns workflows off"; "Claude Code hides the `/config` row while a source other than your user
 * settings sets `enableWorkflows`, or sets `disableWorkflows` to `true`"), workflows.md § Turn
 * workflows off ("`/workflows`, the workflow commands, and the `/workflow-authoring` skill are
 * unavailable"; "The `ultracode` keyword no longer triggers a run, and the Ultracode toggle is
 * removed from `/effort`"; "A run that was already in progress keeps going"; organization toggle on
 * the admin settings page), env-vars.md § `CLAUDE_CODE_DISABLE_WORKFLOWS` ("Set to `1`").
 */
import { describe, expect, test } from 'bun:test';
import {
  WORKFLOWS_ENV,
  workflowsDecision,
  type WorkflowsContext,
} from '../../../src/settings/workflows/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const team: WorkflowsContext = { env: {}, plan: { pro: false } };
const pro: WorkflowsContext = { env: {}, plan: { pro: true } };
const disable = (value: unknown) => ({ disableWorkflows: value });
const enable = (value: unknown) => ({ enableWorkflows: value });
const envOn = { [WORKFLOWS_ENV]: '1' };

spec('settings.key.disableWorkflows', () => {
  test('unset: workflows are on and every surface is available', () => {
    const decision = workflowsDecision(viewOf(), team);
    expect(decision.enabled).toBe(true);
    expect(decision.offBy).toEqual([]);
    expect(Object.values(decision.surfaces).every(Boolean)).toBe(true);
  });

  test('true turns workflows off and removes /workflows, the commands, the authoring skill, the keyword and the Ultracode toggle', () => {
    const decision = workflowsDecision(viewOf(['user', disable(true)]), team);
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['disableWorkflows']);
    expect(plain(decision.surfaces)).toEqual({
      workflowsView: false,
      workflowCommands: false,
      workflowAuthoringSkill: false,
      keyword: false,
      ultracodeToggle: false,
    });
  });

  test('a run already in progress keeps going', () => {
    expect(workflowsDecision(viewOf(['user', disable(true)]), team).inProgressRunsContinue).toBe(
      true,
    );
  });

  test('false is the same as unset: the plan default then decides', () => {
    expect(workflowsDecision(viewOf(['user', disable(false)]), team).enabled).toBe(true);
    expect(workflowsDecision(viewOf(['user', disable(false)]), pro).enabled).toBe(false);
  });

  test('any file sets it', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(workflowsDecision(viewOf([scope, disable(true)]), team).enabled).toBe(false);
    }
  });

  test('managed true reaches everyone: no lower file turns workflows back on', () => {
    const view = viewOf(
      ['managed', disable(true)],
      ['user', disable(false)],
      ['user', enable(true)],
    );
    expect(workflowsDecision(view, team).enabled).toBe(false);
  });

  test('the environment variable turns them off for the session; the setting cannot turn them back on', () => {
    const context = { ...team, env: envOn };
    const decision = workflowsDecision(viewOf(['user', disable(false)]), context);
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['env']);
    expect(workflowsDecision(viewOf(['user', enable(true)]), context).enabled).toBe(false);
  });

  test('the setting and the variable both off: both are named, neither undoes the other', () => {
    const decision = workflowsDecision(viewOf(['user', disable(true)]), { ...team, env: envOn });
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['disableWorkflows', 'env']);
  });

  test('the organization toggle on the admin settings page turns them off', () => {
    const decision = workflowsDecision(viewOf(), { ...team, orgWorkflowsOff: true });
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['orgPolicy']);
  });

  test('a value that is not a Boolean is dropped with a warning, so workflows follow the rest', () => {
    const raw = disable('yes');
    expect(issuesOf('user', raw).length).toBeGreaterThan(0);
    expect(workflowsDecision(viewOf(['user', raw]), team).enabled).toBe(true);
  });
});

spec('settings.key.enableWorkflows', () => {
  test('unset: on, except on the Pro plan where they are off', () => {
    expect(workflowsDecision(viewOf(), team)).toMatchObject({ enabled: true, enabledBy: 'plan' });
    const decision = workflowsDecision(viewOf(), pro);
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['plan']);
  });

  test('true turns them on for you, also on the Pro plan', () => {
    expect(workflowsDecision(viewOf(['user', enable(true)]), pro)).toMatchObject({
      enabled: true,
      enabledBy: 'enableWorkflows',
    });
  });

  test('false turns them off for you', () => {
    const decision = workflowsDecision(viewOf(['user', enable(false)]), team);
    expect(decision.enabled).toBe(false);
    expect(decision.offBy).toEqual(['enableWorkflows']);
  });

  test('true cannot turn them back on while any source turns them off', () => {
    const on = ['user', enable(true)] as const;
    expect(workflowsDecision(viewOf(on, ['project', disable(true)]), pro).enabled).toBe(false);
    expect(workflowsDecision(viewOf(on), { ...pro, orgWorkflowsOff: true }).enabled).toBe(false);
    expect(workflowsDecision(viewOf(on), { ...pro, env: envOn }).enabled).toBe(false);
  });

  test('any file sets it; the highest file that sets it wins', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(workflowsDecision(viewOf([scope, enable(true)]), pro).enabled).toBe(true);
    }
    expect(
      workflowsDecision(viewOf(['local', enable(false)], ['user', enable(true)]), team).enabled,
    ).toBe(false);
  });

  test('the /config row is hidden while a source other than user settings sets enableWorkflows', () => {
    expect(workflowsDecision(viewOf(['user', enable(true)]), team).configRowVisible).toBe(true);
    expect(workflowsDecision(viewOf(), team).configRowVisible).toBe(true);
    for (const scope of ['project', 'local', 'flag', 'managed'] as const) {
      expect(workflowsDecision(viewOf([scope, enable(false)]), team).configRowVisible).toBe(false);
    }
  });

  test('the /config row is hidden while a source other than user settings sets disableWorkflows to true', () => {
    expect(workflowsDecision(viewOf(['managed', disable(true)]), team).configRowVisible).toBe(
      false,
    );
    expect(workflowsDecision(viewOf(['project', disable(true)]), team).configRowVisible).toBe(
      false,
    );
    expect(workflowsDecision(viewOf(['managed', disable(false)]), team).configRowVisible).toBe(
      true,
    );
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a true in any file turns workflows off even under a higher false', () => {
    const view = viewOf(['local', disable(false)], ['user', disable(true)]);
    expect(workflowsDecision(view, team).enabled).toBe(false);
  });

  test('only the documented value 1 of the variable counts', () => {
    for (const value of ['0', 'true', '', undefined]) {
      const context = { ...team, env: { [WORKFLOWS_ENV]: value } };
      expect(workflowsDecision(viewOf(), context).enabled).toBe(true);
    }
  });

  test('a disableWorkflows true in user settings does not hide the /config row', () => {
    expect(workflowsDecision(viewOf(['user', disable(true)]), team).configRowVisible).toBe(true);
  });

  test('every reason is named, in the order setting, variable, organization, enableWorkflows, plan', () => {
    const view = viewOf(['user', disable(true)], ['user', enable(false)]);
    const decision = workflowsDecision(view, { ...pro, env: envOn, orgWorkflowsOff: true });
    expect(decision.offBy).toEqual(['disableWorkflows', 'env', 'orgPolicy', 'enableWorkflows']);
  });
});
