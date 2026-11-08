/**
 * docs/API.md, "Settings": the three workflow readings as one object over a view. The behaviour of
 * each is proven in enablement, keyword and size (settings-reference.md, the four workflow keys;
 * workflows.md, "Turn workflows off", "Where the keyword works", "Set a size guideline").
 */
import { describe, expect, test } from 'bun:test';
import { createWorkflowSettingsPolicy } from '../../../src/settings/workflows/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const context = { env: {}, plan: { pro: true } };

describe('createWorkflowSettingsPolicy', () => {
  test('answers the three questions over one view', () => {
    const view = viewOf(['user', { enableWorkflows: true, workflowSizeGuideline: 'large' }]);
    const policy = createWorkflowSettingsPolicy(view, context);
    expect(policy.workflowsEnabled).toBe(true);
    expect(policy.enablement().enabledBy).toBe('enableWorkflows');
    expect(policy.size().size).toBe('large');
    const prompt = { surface: 'interactive', text: 'ultracode: audit' } as const;
    expect(policy.keyword(prompt).triggers).toBe(true);
  });

  test('turned off, the keyword does not trigger', () => {
    const policy = createWorkflowSettingsPolicy(viewOf(), context);
    expect(policy.workflowsEnabled).toBe(false);
    expect(policy.keyword({ surface: 'interactive', text: 'ultracode' }).triggers).toBe(false);
  });
});
