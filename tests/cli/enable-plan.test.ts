/**
 * plugins/cli-reference.md § plugin enable: "Without `--scope`, the command checks your settings
 * files in the order local, project, user, and uses the first scope that mentions the plugin"; a
 * `--scope` where the plugin isn't declared "writes an override" at a scope that takes precedence
 * ("`claude plugin disable formatter --scope local` turns off a project-enabled plugin for you
 * alone") or "fails with `Plugin "formatter" is installed at project scope, not user. Use --scope
 * project or omit --scope to auto-detect.`"; "If the plugin is already enabled at the resolved scope,
 * the command prints `Plugin "formatter" is already enabled` and exits `1`. With `--json`, the result
 * has `"failureCode": "already_in_goal_state"` and `"alreadyInGoalState": true`"; the three ways a
 * dependency fails the enable; `Successfully enabled plugin: formatter (scope: project)`; "For a plugin
 * synced from claude.ai, pass `<name>@synced`". The failure codes and lines the docs do not quote are
 * outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { planEnable } from '../../src/cli/enable-plan.ts';
import { human, jsonLine, settingsOnly, world } from '../support/toggle.ts';
import type { GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import { spec } from '../support/spec.ts';

const enable = (
  graph: GraphFacts,
  args: { plugin?: string; scope?: string; json?: boolean } = {},
  blocked?: ReadonlySet<string>,
) =>
  planEnable(
    { plugin: 'formatter', ...args },
    { graph: blocked === undefined ? graph : { ...graph, blocked } },
  );

spec('cli.plugin.plugin enable', () => {
  test('enables a disabled plugin where it is declared and names the scope it detected', () => {
    const plan = enable(world(['formatter@m', { scope: 'project', enabled: false }]));
    expect(plan.writes).toEqual([{ scope: 'project', id: 'formatter@m', enabled: true }]);
    expect(human(plan)).toEqual({
      stdout: ['Successfully enabled plugin: formatter (scope: project)'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('without --scope the first scope that mentions it wins, in the order local, project, user', () => {
    const graph = world(
      ['formatter@m', { scope: 'user', enabled: false }],
      ['formatter@m', { scope: 'project', enabled: false }],
      ['formatter@m', { scope: 'local', enabled: false }],
    );
    expect(enable(graph).writes[0]?.scope).toBe('local');
    const noLocal = world(
      ['formatter@m', { scope: 'user', enabled: false }],
      ['formatter@m', { scope: 'project', enabled: false }],
    );
    expect(enable(noLocal).writes[0]?.scope).toBe('project');
  });

  test('a scope that takes precedence over the declaring one gets an override', () => {
    const graph = world(['formatter@m', { scope: 'project', enabled: false }]);
    expect(enable(graph, { scope: 'local' }).writes).toEqual([
      { scope: 'local', id: 'formatter@m', enabled: true },
    ]);
  });

  test('any other scope fails and names the scope the plugin is installed at', () => {
    const graph = world(['formatter@m', { scope: 'project', enabled: false }]);
    const plan = enable(graph, { scope: 'user' });
    expect(plan.writes).toEqual([]);
    expect(human(plan)).toEqual({
      stdout: [],
      stderr: [
        'Plugin "formatter" is installed at project scope, not user. Use --scope project or omit --scope to auto-detect.',
      ],
      exitCode: 1,
    });
  });

  test('already enabled at the resolved scope prints the line and exits 1', () => {
    const plan = enable(world(['formatter@m', { scope: 'project', enabled: true }]));
    expect(plan.writes).toEqual([]);
    expect(human(plan)).toEqual({
      stdout: [],
      stderr: ['Plugin "formatter" is already enabled'],
      exitCode: 1,
    });
  });

  test('--json reports already_in_goal_state and alreadyInGoalState true so a script can treat it as success', () => {
    const plan = enable(world(['formatter@m', { scope: 'project', enabled: true }]), {
      json: true,
    });
    expect(jsonLine(plan)).toMatchObject({
      command: 'enable',
      outcome: 'failed',
      failureCode: 'already_in_goal_state',
      alreadyInGoalState: true,
    });
  });

  test('a plugin synced from claude.ai is named <name>@synced', () => {
    const graph = settingsOnly({ user: { 'formatter@synced': false } });
    const plan = planEnable({ plugin: 'formatter@synced' }, { graph });
    expect(plan.writes).toEqual([{ scope: 'user', id: 'formatter@synced', enabled: true }]);
    expect(human(plan).stdout[0]).toBe(
      'Successfully enabled plugin: formatter@synced (scope: user)',
    );
  });

  test('a plugin no scope mentions is not installed', () => {
    const plan = enable(world(['other@m', { scope: 'user' }]));
    expect(plan.writes).toEqual([]);
    expect(human(plan).exitCode).toBe(1);
  });

  test('a scope outside user, project and local is a usage error', () => {
    const plan = enable(world(['formatter@m', { scope: 'user', enabled: false }]), {
      scope: 'managed',
    });
    expect(plan.output).toMatchObject({ kind: 'usage-error' });
  });
});

describe('enabling a plugin that declares dependencies', () => {
  const app = ['app@m', { scope: 'user', enabled: false, deps: ['lib'] }] as const;
  const named = { plugin: 'app' };

  spec('cli.plugin.plugin enable', () => {
    test('Claude Code enables the dependencies too, dependencies first', () => {
      const graph = world(app, ['lib@m', { scope: 'user', enabled: false }]);
      const plan = planEnable(named, { graph });
      expect(plan.writes).toEqual([
        { scope: 'user', id: 'lib@m', enabled: true },
        { scope: 'user', id: 'app@m', enabled: true },
      ]);
    });

    test('fails and prints the claude plugin install command for a dependency that is not installed', () => {
      const plan = planEnable(named, { graph: world(app) });
      expect(plan.writes).toEqual([]);
      const found = human(plan);
      expect(found.exitCode).toBe(1);
      expect(found.stderr.join('\n')).toContain('claude plugin install lib@m');
    });

    test('fails and names a dependency your organization policy blocks', () => {
      const graph = {
        ...world(app, ['lib@m', { scope: 'user', enabled: false }]),
        blocked: new Set(['lib@m']),
      };
      const plan = planEnable(named, { graph });
      expect(plan.writes).toEqual([]);
      expect(human(plan).stderr.join('\n')).toContain('lib@m');
      expect(human(plan).stderr.join('\n')).toContain('blocked');
    });

    test('fails for a dependency set to false at a scope with higher precedence than the target', () => {
      const graph = world(
        app,
        ['lib@m', { scope: 'user', enabled: true }],
        ['lib@m', { scope: 'local', enabled: false }],
      );
      const plan = planEnable(named, { graph });
      expect(plan.writes).toEqual([]);
      expect(human(plan).stderr.join('\n')).toContain('--scope local');
    });

    test('passing --scope at that higher scope writes there instead', () => {
      const graph = world(app, ['lib@m', { scope: 'local', enabled: false }]);
      const plan = planEnable({ ...named, scope: 'local' }, { graph });
      expect(human(plan).exitCode).toBe(0);
      expect(plan.writes.map((write) => write.scope)).toEqual(['local', 'local']);
    });
  });
});

describe('the failure codes of a refused enable', () => {
  test('each way a dependency stops it has its own code (judgment)', () => {
    const app = ['app@m', { scope: 'user', enabled: false, deps: ['lib'] }] as const;
    const missing = jsonLine(planEnable({ plugin: 'app' }, { graph: world(app) }));
    expect(missing).toMatchObject({ failureCode: 'dependency_not_installed' });
  });
});
