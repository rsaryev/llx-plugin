/**
 * settings-reference.md § `workflowSizeGuideline` (Scope "Any file"; "Claude Code sends the value to
 * Claude as advice, not an enforced cap: `small` asks for fewer than 5 agents, `medium` fewer than
 * 10, and `large` fewer than 50"; `unrestricted`: "no guideline, so Claude sizes the workflow to the
 * task"; "A value there takes precedence over the Dynamic workflow size choice in `/config`, which
 * Claude Code stores in `~/.claude.json`, and Claude Code hides that row while a settings file sets
 * the key"; Default `medium`, or `small` on a Pro plan), workflows.md § Set a size guideline (the
 * value table; "The default is `medium`, or `small` when you're signed in on a Pro plan"; "the
 * workflow's `Running in background` line names the size in force"), § Cost ("If you choose a size
 * guideline yourself, its agent count replaces the 25-agent threshold. The built-in default guideline
 * leaves the threshold at 25"; "Sessions with ultracode on don't show the warning"; "more than 25
 * agents, or its projected token total passes 1.5 million").
 */
import { describe, expect, test } from 'bun:test';
import { workflowSize, type WorkflowSizeContext } from '../../../src/settings/workflows/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const team: WorkflowSizeContext = { plan: { pro: false } };
const pro: WorkflowSizeContext = { plan: { pro: true } };
const guideline = (value: unknown) => ({ workflowSizeGuideline: value });

spec('settings.key.workflowSizeGuideline', () => {
  test('each value maps to the agent count Claude aims for, as advice and not a cap', () => {
    const bounds = [
      ['unrestricted', undefined],
      ['small', 5],
      ['medium', 10],
      ['large', 50],
    ] as const;
    for (const [size, below] of bounds) {
      const decision = workflowSize(viewOf(['user', guideline(size)]), team);
      expect(decision.size).toBe(size);
      expect(decision.agentsBelow).toBe(below);
      expect(decision.enforced).toBe(false);
    }
  });

  test('unset: medium, or small on a Pro plan', () => {
    expect(plain(workflowSize(viewOf(), team))).toMatchObject({
      size: 'medium',
      agentsBelow: 10,
      source: 'default',
    });
    expect(plain(workflowSize(viewOf(), pro))).toMatchObject({
      size: 'small',
      agentsBelow: 5,
      source: 'default',
    });
  });

  test('any file sets it, and the highest file that sets it wins', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(workflowSize(viewOf([scope, guideline('large')]), team)).toMatchObject({
        size: 'large',
        source: 'settings',
        settingsScope: scope,
      });
    }
    const view = viewOf(['local', guideline('small')], ['user', guideline('large')]);
    expect(workflowSize(view, team).size).toBe('small');
  });

  test('a settings file takes precedence over the /config choice, which hides the /config row', () => {
    const context = { ...team, configChoice: 'large' } as const;
    const fromFile = workflowSize(viewOf(['user', guideline('small')]), context);
    expect(fromFile).toMatchObject({ size: 'small', source: 'settings', configRowVisible: false });
    const fromConfig = workflowSize(viewOf(), context);
    expect(fromConfig).toMatchObject({ size: 'large', source: 'config', configRowVisible: true });
  });

  test('the default is marked as the default until a value is chosen', () => {
    expect(workflowSize(viewOf(), team).source).toBe('default');
    expect(workflowSize(viewOf(), { ...team, configChoice: 'medium' }).source).toBe('config');
  });

  test('a value you choose replaces the 25-agent large-workflow threshold with its agent count', () => {
    expect(workflowSize(viewOf(['user', guideline('small')]), team).largeWorkflowThreshold).toBe(5);
    expect(workflowSize(viewOf(['user', guideline('large')]), team).largeWorkflowThreshold).toBe(
      50,
    );
    expect(workflowSize(viewOf(), { ...team, configChoice: 'medium' }).largeWorkflowThreshold).toBe(
      10,
    );
  });

  test('the built-in default guideline leaves the threshold at 25', () => {
    expect(workflowSize(viewOf(), team).largeWorkflowThreshold).toBe(25);
    expect(workflowSize(viewOf(), pro).largeWorkflowThreshold).toBe(25);
  });

  test('the warning also shows past a projected 1.5 million tokens, whatever the guideline', () => {
    expect(workflowSize(viewOf(), team).largeWorkflowTokens).toBe(1_500_000);
    expect(workflowSize(viewOf(['user', guideline('small')]), team).largeWorkflowTokens).toBe(
      1_500_000,
    );
  });

  test('a session with ultracode on shows no Large workflow warning', () => {
    const ultracode = { ...team, ultracode: true };
    for (const value of [undefined, 'small', 'large', 'unrestricted']) {
      const view = value === undefined ? viewOf() : viewOf(['user', guideline(value)]);
      expect(workflowSize(view, ultracode)).toMatchObject({
        largeWorkflowThreshold: undefined,
        largeWorkflowTokens: undefined,
      });
    }
    expect(workflowSize(viewOf(), { ...team, ultracode: false }).largeWorkflowThreshold).toBe(25);
  });

  test("the size in force is what the Running in background line names: the decision's size", () => {
    expect(workflowSize(viewOf(), team).size).toBe('medium');
    expect(workflowSize(viewOf(), { ...team, configChoice: 'large' }).size).toBe('large');
    expect(workflowSize(viewOf(['user', guideline('small')]), team).size).toBe('small');
  });

  test('a value that is not one of the four is dropped with a warning, so the default applies', () => {
    for (const bad of ['huge', 'Small', 5, true]) {
      const raw = guideline(bad);
      expect(issuesOf('user', raw).length).toBeGreaterThan(0);
      expect(workflowSize(viewOf(['user', raw]), pro)).toMatchObject({
        size: 'small',
        source: 'default',
      });
    }
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('unrestricted has no agent count, so it leaves the threshold at 25', () => {
    const decision = workflowSize(viewOf(['user', guideline('unrestricted')]), team);
    expect(decision).toMatchObject({ agentsBelow: undefined, largeWorkflowThreshold: 25 });
  });

  test("the /config choice is the host's data; the plan default decides when it has none", () => {
    expect(workflowSize(viewOf(), { plan: { pro: true }, configChoice: undefined }).size).toBe(
      'small',
    );
  });
});
