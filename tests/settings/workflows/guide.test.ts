/**
 * workflows.md § Set a size guideline (the value table: `unrestricted`, `small` fewer than 5, `medium`
 * fewer than 10, `large` fewer than 50; "advice, not a cap"; the default `medium`, `small` on Pro;
 * `/config workflowSizeGuideline=small`; a settings file takes precedence over `/config` and hides its
 * row; "Changes take effect on the next prompt"), § Cost (a chosen size replaces the 25-agent
 * threshold of the `Large workflow` warning), § Turn workflows off (`/config`, `disableWorkflows`,
 * `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, managed settings, the admin toggle; what goes away; "A run that
 * was already in progress keeps going"). The keys are read in settings-reference.md; these blocks
 * assert the workflows.md reading of the same policy.
 */
import { expect, test } from 'bun:test';
import {
  WORKFLOWS_ENV,
  createWorkflowSettingsPolicy,
  workflowSize,
  workflowsDecision,
  type WorkflowSizeContext,
} from '../../../src/settings/workflows/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const team: WorkflowSizeContext = { plan: { pro: false } };
const pro: WorkflowSizeContext = { plan: { pro: true } };
const sized = (value: string) => viewOf(['user', { workflowSizeGuideline: value }]);

spec('workflows.behavior.Set a size guideline.unrestricted', () => {
  test('no guideline: Claude sizes the workflow to the task, so no agent count is sent', () => {
    const decision = workflowSize(sized('unrestricted'), team);
    expect(decision.size).toBe('unrestricted');
    expect(decision.agentsBelow).toBeUndefined();
    expect(decision.enforced).toBe(false);
  });

  test('it is a value to pick, not the default: nothing set is medium (small on Pro)', () => {
    expect(workflowSize(viewOf(), team).size).toBe('medium');
    expect(workflowSize(viewOf(), pro).size).toBe('small');
  });
});

spec('workflows.behavior.Set a size guideline.small', () => {
  test('fewer than 5 agents, advice and not a cap', () => {
    const decision = workflowSize(sized('small'), team);
    expect(decision.agentsBelow).toBe(5);
    expect(decision.enforced).toBe(false);
  });

  test('it is the default when signed in on a Pro plan, until a value is chosen', () => {
    expect(workflowSize(viewOf(), pro)).toMatchObject({
      size: 'small',
      source: 'default',
      agentsBelow: 5,
    });
    expect(workflowSize(sized('large'), pro).size).toBe('large');
  });

  test('/config workflowSizeGuideline=small is the choice of /config, and a settings file takes precedence over it', () => {
    const config: WorkflowSizeContext = { plan: { pro: false }, configChoice: 'small' };
    expect(workflowSize(viewOf(), config)).toMatchObject({ size: 'small', source: 'config' });
    const decision = workflowSize(sized('large'), config);
    expect(decision).toMatchObject({ size: 'large', source: 'settings', configRowVisible: false });
    expect(workflowSize(viewOf(), config).configRowVisible).toBe(true);
  });
});

spec('workflows.behavior.Set a size guideline.medium', () => {
  test('fewer than 10 agents', () => {
    expect(workflowSize(sized('medium'), pro).agentsBelow).toBe(10);
  });

  test('it is the default off Pro, and the default leaves the 25-agent warning threshold', () => {
    const decision = workflowSize(viewOf(), team);
    expect(decision).toMatchObject({ size: 'medium', source: 'default', agentsBelow: 10 });
    expect(decision.largeWorkflowThreshold).toBe(25);
  });

  test('choosing it yourself replaces the threshold with its own count', () => {
    expect(workflowSize(sized('medium'), team).largeWorkflowThreshold).toBe(10);
  });
});

spec('workflows.behavior.Set a size guideline.large', () => {
  test('fewer than 50 agents', () => {
    expect(workflowSize(sized('large'), team).agentsBelow).toBe(50);
  });

  test('its count replaces the 25-agent threshold of the Large workflow warning; ultracode shows none', () => {
    expect(workflowSize(sized('large'), team).largeWorkflowThreshold).toBe(50);
    const ultracode: WorkflowSizeContext = { plan: { pro: false }, ultracode: true };
    expect(workflowSize(sized('large'), ultracode).largeWorkflowThreshold).toBeUndefined();
  });

  test('a value that is not one of the four is not a size: the default applies', () => {
    expect(workflowSize(sized('huge'), team)).toMatchObject({ size: 'medium', source: 'default' });
  });
});

const off = { env: {}, plan: { pro: false } };
const SURFACES = [
  'workflowsView',
  'workflowCommands',
  'workflowAuthoringSkill',
  'keyword',
  'ultracodeToggle',
] as const;

spec('workflows.behavior.Turn workflows off', () => {
  test('on by default off Pro: every surface is available', () => {
    const decision = workflowsDecision(viewOf(), off);
    expect(decision.enabled).toBe(true);
    for (const surface of SURFACES) expect(decision.surfaces[surface]).toBe(true);
  });

  test('each way of turning them off for yourself works, and takes /workflows, the commands, the skill, the keyword and the toggle with it', () => {
    const ways = [
      workflowsDecision(viewOf(['user', { enableWorkflows: false }]), off),
      workflowsDecision(viewOf(['user', { disableWorkflows: true }]), off),
      workflowsDecision(viewOf(), { ...off, env: { [WORKFLOWS_ENV]: '1' } }),
    ];
    for (const decision of ways) {
      expect(decision.enabled).toBe(false);
      for (const surface of SURFACES) expect(decision.surfaces[surface]).toBe(false);
    }
  });

  test('the whole organization: managed settings or the admin toggle', () => {
    expect(workflowsDecision(viewOf(['managed', { disableWorkflows: true }]), off).offBy).toEqual([
      'disableWorkflows',
    ]);
    expect(workflowsDecision(viewOf(), { ...off, orgWorkflowsOff: true }).offBy).toEqual([
      'orgPolicy',
    ]);
  });

  test('turned off, the ultracode keyword no longer triggers a run', () => {
    const prompt = { surface: 'interactive', text: 'ultracode: audit every route' } as const;
    const on = createWorkflowSettingsPolicy(viewOf(), off);
    const none = createWorkflowSettingsPolicy(viewOf(['user', { disableWorkflows: true }]), off);
    expect(on.keyword(prompt).triggers).toBe(true);
    expect(none.keyword(prompt).triggers).toBe(false);
  });

  test('an environment value other than 1 does not turn them off', () => {
    for (const value of ['0', 'true', '']) {
      expect(workflowsDecision(viewOf(), { ...off, env: { [WORKFLOWS_ENV]: value } }).enabled).toBe(
        true,
      );
    }
  });
});
