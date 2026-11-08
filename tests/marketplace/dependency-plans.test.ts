/**
 * plugins/install.md § Plugins with dependencies (install also installs and enables the declared
 * dependencies at the same scope and the success message lists them; enable also enables the
 * dependencies that are installed but disabled, and fails, telling you to install first, when one is
 * not installed; disable of a plugin another enabled plugin still needs is refused with a chained
 * command that disables both in the right order; uninstall leaves auto-installed dependencies until
 * `claude plugin prune`); plugins/cli-reference.md § plugin enable (the command prints the `claude
 * plugin install` command for each missing dependency), § plugin prune (never removes a plugin you
 * installed yourself). The dependency declarations themselves are `normalizeDependency`'s; the
 * wording of the install success line's list and of the refusals is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  planDisable,
  planEnable,
  planInstall,
  planPrune,
  planUninstall,
  type PluginNode,
} from '../../src/marketplace/dependency-plans.ts';
import { spec } from '../support/spec.ts';

const node = (id: string, extra: Partial<PluginNode> = {}): PluginNode => ({
  id,
  installed: true,
  enabled: true,
  dependencies: [],
  ...extra,
});

const app = (extra: Partial<PluginNode> = {}) =>
  node('app@acme', { dependencies: ['lib@acme'], ...extra });

spec('install.guide.Plugins with dependencies.Install', () => {
  test('installs the plugin and its declared dependencies at the same scope, dependencies first', () => {
    const plan = planInstall('app@acme', 'project', [
      app({ installed: false, enabled: false }),
      node('lib@acme', { installed: false, enabled: false, dependencies: ['base@acme'] }),
      node('base@acme', { installed: false, enabled: false }),
    ]);
    expect(plan).toMatchObject({
      install: ['base@acme', 'lib@acme', 'app@acme'],
      enable: ['base@acme', 'lib@acme', 'app@acme'],
      autoInstalled: ['base@acme', 'lib@acme'],
      scope: 'project',
    });
    expect(plan.refused).toBeUndefined();
  });

  test('the success message lists the dependencies', () => {
    const plan = planInstall('app@acme', 'project', [
      app({ installed: false, enabled: false }),
      node('lib@acme', { installed: false, enabled: false }),
    ]);
    expect(plan.message).toBe(
      'Successfully installed plugin: app@acme (scope: project) (+ 1 dependencies: lib@acme)',
    );
  });

  test('a plugin without dependencies installs alone, with no list', () => {
    const plan = planInstall('lib@acme', 'user', [
      node('lib@acme', { installed: false, enabled: false }),
    ]);
    expect(plan.install).toEqual(['lib@acme']);
    expect(plan.message).toBe('Successfully installed plugin: lib@acme (scope: user)');
  });

  test('a dependency already installed but disabled is enabled, not installed again', () => {
    const plan = planInstall('app@acme', 'user', [
      app({ installed: false, enabled: false }),
      node('lib@acme', { enabled: false }),
    ]);
    expect(plan.install).toEqual(['app@acme']);
    expect(plan.enable).toEqual(['lib@acme', 'app@acme']);
    expect(plan.autoInstalled).toEqual([]);
  });

  test('a dependency the catalog does not list refuses the install', () => {
    const plan = planInstall('app@acme', 'user', [app({ installed: false, enabled: false })]);
    expect(plan.install).toEqual([]);
    expect(plan.refused?.message).toBe('Dependency "lib@acme" is not installed');
  });

  test('a cycle terminates', () => {
    const plan = planInstall('a@m', 'user', [
      node('a@m', { installed: false, enabled: false, dependencies: ['b@m'] }),
      node('b@m', { installed: false, enabled: false, dependencies: ['a@m'] }),
    ]);
    expect(plan.install).toEqual(['b@m', 'a@m']);
  });
});

spec('install.guide.Plugins with dependencies.Enable', () => {
  test('also enables the dependencies that are installed but disabled', () => {
    const plan = planEnable('app@acme', [
      app({ enabled: false }),
      node('lib@acme', { enabled: false, dependencies: ['base@acme'] }),
      node('base@acme', { enabled: false }),
    ]);
    expect(plan).toEqual({ enable: ['base@acme', 'lib@acme', 'app@acme'] });
  });

  test('a dependency already on is left alone', () => {
    expect(planEnable('app@acme', [app({ enabled: false }), node('lib@acme')])).toEqual({
      enable: ['app@acme'],
    });
  });

  test('fails when a declared dependency is not installed, with the install command for each', () => {
    const plan = planEnable('app@acme', [
      app({ enabled: false, dependencies: ['lib@acme', 'other@acme'] }),
      node('lib@acme', { installed: false, enabled: false }),
    ]);
    expect(plan).toEqual({
      enable: [],
      failure: {
        missing: ['lib@acme', 'other@acme'],
        message: 'Dependencies "lib@acme", "other@acme" are not installed. Install them first.',
        commands: ['claude plugin install lib@acme', 'claude plugin install other@acme'],
      },
    });
  });

  test('one missing dependency is named in the singular', () => {
    const plan = planEnable('app@acme', [app({ enabled: false })]);
    expect(plan.failure?.message).toBe('Dependency "lib@acme" is not installed. Install it first.');
  });

  test('an unknown plugin enables nothing and fails naming itself', () => {
    expect(planEnable('ghost@acme', []).failure?.missing).toEqual(['ghost@acme']);
  });
});

spec('install.guide.Plugins with dependencies.Disable', () => {
  test('refuses while another enabled plugin needs it, printing one chained command that disables both in order', () => {
    const plan = planDisable('lib@acme', [app(), node('lib@acme')]);
    expect(plan).toEqual({
      disable: [],
      refusal: {
        dependents: ['app@acme'],
        message: 'Cannot disable "lib@acme": "app@acme" still needs it.',
        command: 'claude plugin disable app@acme && claude plugin disable lib@acme',
      },
    });
  });

  test('a chain of dependents is disabled farthest first', () => {
    const plan = planDisable('base@acme', [
      node('top@acme', { dependencies: ['app@acme'] }),
      app({ dependencies: ['base@acme'] }),
      node('base@acme'),
    ]);
    expect(plan.refusal?.command).toBe(
      'claude plugin disable top@acme && claude plugin disable app@acme && claude plugin disable base@acme',
    );
  });

  test('a dependent that is itself disabled does not hold it', () => {
    expect(planDisable('lib@acme', [app({ enabled: false }), node('lib@acme')])).toEqual({
      disable: ['lib@acme'],
    });
  });

  test('a plugin nothing needs is disabled', () => {
    expect(planDisable('app@acme', [app(), node('lib@acme')])).toEqual({ disable: ['app@acme'] });
  });
});

spec('install.guide.Plugins with dependencies.Uninstall', () => {
  test('uninstalls the plugin and leaves its auto-installed dependencies until prune', () => {
    const plan = planUninstall('app@acme', [app(), node('lib@acme', { autoInstalled: true })]);
    expect(plan).toEqual({
      uninstall: ['app@acme'],
      keptDependencies: ['lib@acme'],
      orphaned: ['lib@acme'],
      pruneCommand: 'claude plugin prune',
    });
  });

  test('a dependency another installed plugin still needs is not orphaned', () => {
    const plan = planUninstall('app@acme', [
      app(),
      node('other@acme', { dependencies: ['lib@acme'] }),
      node('lib@acme', { autoInstalled: true }),
    ]);
    expect(plan.orphaned).toEqual([]);
    expect(plan.keptDependencies).toEqual(['lib@acme']);
  });

  test('a dependency you installed yourself is kept and never orphaned', () => {
    const plan = planUninstall('app@acme', [app(), node('lib@acme')]);
    expect(plan.orphaned).toEqual([]);
  });
});

describe('prune (cli-reference.md, "plugin prune")', () => {
  test('removes auto-installed dependencies no installed plugin needs, never one you installed yourself', () => {
    expect(
      planPrune([
        node('lib@acme', { autoInstalled: true }),
        node('mine@acme'),
        node('used@acme', { autoInstalled: true }),
        node('app@acme', { dependencies: ['used@acme'] }),
      ]),
    ).toEqual(['lib@acme']);
  });

  test('a chain of auto-installed dependencies goes together once nothing installed needs the top', () => {
    expect(
      planPrune([
        node('a@m', { autoInstalled: true, dependencies: ['b@m'] }),
        node('b@m', { autoInstalled: true }),
      ]),
    ).toEqual(['a@m', 'b@m']);
  });
});
