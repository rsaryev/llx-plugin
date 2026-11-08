/**
 * plugins/install.md § Plugins with dependencies (enable also enables the dependencies that are
 * installed but disabled, and fails, telling you to install first, when one is not installed);
 * plugins/cli-reference.md § plugin enable (the command prints the `claude plugin install` command
 * for each missing dependency, and fails for a dependency blocked by the organization's plugin policy
 * or set to `false` at a scope with higher precedence than the target scope). The wording of the
 * missing and overridden failures is a row in spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import { planEnable } from '../../src/marketplace/dependency-enable.ts';
import { spec } from '../support/spec.ts';
import { app, node } from '../support/dependency-nodes.ts';

spec('install.guide.Plugins with dependencies.Enable', () => {
  test('also enables the dependencies that are installed but disabled', () => {
    const plan = planEnable('app@acme', 'user', [
      app({ enabled: false }),
      node('lib@acme', { enabled: false, dependencies: ['base@acme'] }),
      node('base@acme', { enabled: false }),
    ]);
    expect(plan).toEqual({ enable: ['base@acme', 'lib@acme', 'app@acme'] });
  });

  test('a dependency already on is left alone', () => {
    expect(planEnable('app@acme', 'user', [app({ enabled: false }), node('lib@acme')])).toEqual({
      enable: ['app@acme'],
    });
  });

  test('fails when a declared dependency is not installed, with the install command for each', () => {
    const plan = planEnable('app@acme', 'user', [
      app({ enabled: false, dependencies: ['lib@acme', 'other@acme'] }),
      node('lib@acme', { installed: false, enabled: false }),
    ]);
    expect(plan).toEqual({
      enable: [],
      failure: {
        missing: ['lib@acme', 'other@acme'],
        blocked: [],
        overridden: [],
        message: 'Dependencies "lib@acme", "other@acme" are not installed. Install them first.',
        commands: ['claude plugin install lib@acme', 'claude plugin install other@acme'],
      },
    });
  });

  test('one missing dependency is named in the singular', () => {
    const plan = planEnable('app@acme', 'user', [app({ enabled: false })]);
    expect(plan.failure?.message).toBe('Dependency "lib@acme" is not installed. Install it first.');
  });

  test('fails, naming the dependency, when the organization policy blocks it', () => {
    const plan = planEnable('app@acme', 'user', [
      app({ enabled: false }),
      node('lib@acme', { enabled: false, blockedByPolicy: true }),
    ]);
    expect(plan.enable).toEqual([]);
    expect(plan.failure?.blocked).toEqual(['lib@acme']);
    expect(plan.failure?.message).toBe(
      'Plugin "app@acme" depends on "lib@acme", which is blocked by your organization\'s policy',
    );
  });

  test('a blocked plugin that is not a dependency is not the enable failure', () => {
    const plan = planEnable('app@acme', 'user', [
      app({ enabled: false, blockedByPolicy: true }),
      node('lib@acme'),
    ]);
    expect(plan.failure).toBeUndefined();
  });

  test('fails when a dependency is set to false at a scope above the target, pointing at that scope', () => {
    const lib = { ...node('lib@acme'), enabledIn: { user: true, local: false } as const };
    const plan = planEnable('app@acme', 'project', [
      app({ enabled: false, scope: 'project' }),
      lib,
    ]);
    expect(plan.enable).toEqual([]);
    expect(plan.failure?.overridden).toEqual([{ id: 'lib@acme', scope: 'local' }]);
    expect(plan.failure?.message).toBe(
      'Plugin "app@acme" depends on "lib@acme", which is disabled at local scope, which takes precedence over project. Enable it at local scope, or pass --scope local to write there.',
    );
  });

  test('passing that scope writes there: the dependency is enabled at the target', () => {
    const lib = { ...node('lib@acme'), enabledIn: { user: true, local: false } as const };
    const plan = planEnable('app@acme', 'local', [app({ enabled: false, scope: 'local' }), lib]);
    expect(plan).toEqual({ enable: ['lib@acme', 'app@acme'] });
  });

  test('a false at a scope below the target does not stop the enable', () => {
    const lib = { ...node('lib@acme'), enabledIn: { user: true, project: false } as const };
    const plan = planEnable('app@acme', 'local', [app({ enabled: false, scope: 'local' }), lib]);
    expect(plan.failure).toBeUndefined();
    expect(plan.enable).toEqual(['lib@acme', 'app@acme']);
  });

  test('a missing dependency is reported before a blocked one', () => {
    const plan = planEnable('app@acme', 'user', [
      app({ enabled: false, dependencies: ['lib@acme', 'gone@acme'] }),
      node('lib@acme', { blockedByPolicy: true }),
    ]);
    expect(plan.failure?.missing).toEqual(['gone@acme']);
    expect(plan.failure?.blocked).toEqual([]);
  });

  test('an unknown plugin enables nothing and fails naming itself', () => {
    expect(planEnable('ghost@acme', 'user', []).failure?.missing).toEqual(['ghost@acme']);
  });
});
