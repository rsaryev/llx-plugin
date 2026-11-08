/**
 * Judgments of `enable` and `disable` (spec/judgments.md, `src/cli/toggle-target.ts`): which plugin a
 * bare name picks, the codes of the refusals the docs do not name, and what "mentions" means. The
 * quoted lines are plugins/cli-reference.md § plugin enable and § plugin disable; these tests sit
 * outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { planDisable } from '../../src/cli/disable-plan.ts';
import { planEnable } from '../../src/cli/enable-plan.ts';
import type { TogglePlan } from '../../src/cli/enable-plan.ts';
import { jsonLine, settingsOnly, world } from '../support/toggle.ts';

const code = (plan: TogglePlan) => jsonLine(plan)['failureCode'];

describe('a bare name', () => {
  const graph = world(
    ['formatter@a', { scope: 'user', enabled: false }],
    ['formatter@b', { scope: 'user', enabled: false }],
  );

  test('two marketplaces offering it refuse enable and disable and list the qualified commands', () => {
    const enable = planEnable({ plugin: 'formatter' }, { graph });
    expect(code(enable)).toBe('ambiguous_plugin');
    expect(JSON.stringify(enable.output)).toContain('claude plugin enable formatter@a');
    expect(code(planDisable({ plugin: 'formatter' }, { graph }))).toBe('ambiguous_plugin');
  });

  test('the qualified name picks one', () => {
    expect(planEnable({ plugin: 'formatter@b' }, { graph }).writes[0]?.id).toBe('formatter@b');
  });
});

describe('the codes of the refusals', () => {
  const graph = world(['formatter@m', { scope: 'project', enabled: false }]);

  test('a plugin nobody installs is not_installed', () => {
    expect(code(planEnable({ plugin: 'ghost' }, { graph }))).toBe('not_installed');
  });

  test('a --scope that neither declares nor outranks is wrong_scope', () => {
    expect(code(planEnable({ plugin: 'formatter', scope: 'user' }, { graph }))).toBe('wrong_scope');
  });
});

describe('which scopes mention a plugin', () => {
  test('managed settings alone are not a scope the command writes: the plugin is not installed for it', () => {
    const graph = settingsOnly({ managed: { 'formatter@m': true } });
    const plan = planDisable({ plugin: 'formatter@m' }, { graph });
    expect(plan.writes).toEqual([]);
    expect(code(plan)).toBe('not_installed');
  });

  test('an install record counts when no settings file mentions the plugin', () => {
    const graph = world(['formatter@m', { scope: 'user', enabled: null }]);
    expect(planEnable({ plugin: 'formatter' }, { graph }).writes).toEqual([
      { scope: 'user', id: 'formatter@m', enabled: true },
    ]);
  });

  test('an override at a winning scope is a write even when a lower scope already enabled it', () => {
    const graph = world(['formatter@m', { scope: 'user', enabled: true }]);
    const plan = planEnable({ plugin: 'formatter', scope: 'local' }, { graph });
    expect(plan.writes).toEqual([{ scope: 'local', id: 'formatter@m', enabled: true }]);
  });
});
