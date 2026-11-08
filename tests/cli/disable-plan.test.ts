/**
 * plugins/cli-reference.md § plugin disable: "Disable a plugin without uninstalling it. For a plugin
 * synced from claude.ai, pass `<name>@synced`"; `-a, --all` "Disable every enabled plugin. Can't be
 * combined with a plugin name or `--scope`"; `-s, --scope` "Auto-detected when omitted"; `--json`;
 * "Without `--scope`, the scope is auto-detected in the same local, project, user order as `plugin
 * enable`"; "If you pass neither a plugin name nor `--all`, Claude Code prints `Please specify a
 * plugin name or use --all to disable all plugins` and exits `1`. Disabling a plugin that is already
 * disabled prints `Plugin "formatter" is already disabled` and exits `1`"; "The command fails for a
 * plugin that is still required: another enabled plugin depends on it ... names the dependents to
 * disable first; your organization requires it as a synced plugin ... saves nothing";
 * `Successfully disabled plugin: formatter (scope: project)`. The wording of the refusals the docs do
 * not quote and what `--all` prints are outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { planDisable, NAME_OR_ALL, type DisableArguments } from '../../src/cli/disable-plan.ts';
import type { ToggleFacts } from '../../src/cli/toggle-target.ts';
import { human, jsonLine, settingsOnly, world } from '../support/toggle.ts';
import type { GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import { spec } from '../support/spec.ts';

const disable = (
  graph: GraphFacts,
  args: DisableArguments = { plugin: 'formatter' },
  extra: Partial<ToggleFacts> = {},
) => planDisable(args, { graph, ...extra });

const ENABLED = world(['formatter@m', { scope: 'project', enabled: true }]);

spec('cli.plugin.plugin disable', () => {
  test('disables the plugin where it is declared and prints Successfully disabled plugin', () => {
    const plan = disable(ENABLED);
    expect(plan.writes).toEqual([{ scope: 'project', id: 'formatter@m', enabled: false }]);
    expect(human(plan)).toEqual({
      stdout: ['Successfully disabled plugin: formatter (scope: project)'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('disabling a plugin that is already disabled prints the line and exits 1', () => {
    const plan = disable(world(['formatter@m', { scope: 'project', enabled: false }]));
    expect(plan.writes).toEqual([]);
    expect(human(plan)).toEqual({
      stdout: [],
      stderr: ['Plugin "formatter" is already disabled'],
      exitCode: 1,
    });
  });

  test('neither a plugin name nor --all prints the Please specify line and exits 1', () => {
    const plan = disable(ENABLED, {});
    expect(plan.writes).toEqual([]);
    expect(human(plan)).toEqual({ stdout: [], stderr: [NAME_OR_ALL], exitCode: 1 });
    expect(NAME_OR_ALL).toBe('Please specify a plugin name or use --all to disable all plugins');
  });

  test('another enabled plugin that depends on it makes the command fail and names the dependents', () => {
    const graph = world(
      ['lib@m', { scope: 'user', enabled: true }],
      ['app@m', { scope: 'user', enabled: true, deps: ['lib'] }],
    );
    const plan = disable(graph, { plugin: 'lib' });
    expect(plan.writes).toEqual([]);
    const found = human(plan);
    expect(found.exitCode).toBe(1);
    expect(found.stderr.join('\n')).toContain('"app@m"');
    expect(found.stderr.join('\n')).toContain(
      'claude plugin disable app@m && claude plugin disable lib@m',
    );
  });

  test('a disabled dependent does not stop the disable', () => {
    const graph = world(
      ['lib@m', { scope: 'user', enabled: true }],
      ['app@m', { scope: 'user', enabled: false, deps: ['lib'] }],
    );
    expect(disable(graph, { plugin: 'lib' }).writes).toHaveLength(1);
  });

  test('a synced plugin the organization requires fails and saves nothing', () => {
    const graph = settingsOnly({ user: { 'formatter@synced': true } });
    const plan = disable(
      graph,
      { plugin: 'formatter@synced' },
      {
        requiredByOrganization: new Set(['formatter@synced']),
      },
    );
    expect(plan.writes).toEqual([]);
    expect(human(plan).exitCode).toBe(1);
  });

  test('a synced plugin is named <name>@synced', () => {
    const graph = settingsOnly({ user: { 'formatter@synced': true } });
    const plan = disable(graph, { plugin: 'formatter@synced' });
    expect(plan.writes).toEqual([{ scope: 'user', id: 'formatter@synced', enabled: false }]);
  });

  test('an override at a scope that wins turns a project-enabled plugin off for you alone', () => {
    const plan = disable(ENABLED, { plugin: 'formatter', scope: 'local' });
    expect(plan.writes).toEqual([{ scope: 'local', id: 'formatter@m', enabled: false }]);
  });
});

spec('cli.plugin.plugin disable.--json', () => {
  test('prints the same object as install --json with pluginId and scope', () => {
    expect(jsonLine(disable(ENABLED))).toEqual({
      command: 'disable',
      outcome: 'ok',
      pluginId: 'formatter@m',
      scope: 'project',
      message: 'Successfully disabled plugin: formatter (scope: project)',
    });
  });

  test('an already disabled plugin carries already_in_goal_state and alreadyInGoalState true', () => {
    const plan = disable(world(['formatter@m', { scope: 'project', enabled: false }]));
    expect(jsonLine(plan)).toMatchObject({
      command: 'disable',
      outcome: 'failed',
      failureCode: 'already_in_goal_state',
      alreadyInGoalState: true,
    });
  });
});

spec('cli.plugin.plugin disable.-s, --scope <scope>', () => {
  test('is auto-detected in the order local, project, user when omitted', () => {
    const graph = world(
      ['formatter@m', { scope: 'user', enabled: true }],
      ['formatter@m', { scope: 'project', enabled: true }],
    );
    expect(disable(graph).writes[0]?.scope).toBe('project');
  });

  test('a scope the plugin is declared at is written as it is', () => {
    const graph = world(
      ['formatter@m', { scope: 'user', enabled: true }],
      ['formatter@m', { scope: 'project', enabled: true }],
    );
    expect(disable(graph, { plugin: 'formatter', scope: 'user' }).writes[0]?.scope).toBe('user');
  });

  test('any other scope fails and names the scope it is installed at', () => {
    const plan = disable(ENABLED, { plugin: 'formatter', scope: 'user' });
    expect(plan.writes).toEqual([]);
    expect(human(plan).stderr[0]).toBe(
      'Plugin "formatter" is installed at project scope, not user. Use --scope project or omit --scope to auto-detect.',
    );
  });
});

spec('cli.plugin.plugin disable.-a, --all', () => {
  const graph = world(
    ['a@m', { scope: 'user', enabled: true }],
    ['b@m', { scope: 'project', enabled: true }],
    ['c@m', { scope: 'user', enabled: false }],
  );

  test('disables every enabled plugin, each where it is enabled', () => {
    const plan = disable(graph, { all: true });
    expect(plan.writes).toEqual([
      { scope: 'user', id: 'a@m', enabled: false },
      { scope: 'project', id: 'b@m', enabled: false },
    ]);
  });

  test('cannot be combined with a plugin name', () => {
    expect(disable(graph, { all: true, plugin: 'a' }).output).toMatchObject({
      kind: 'usage-error',
    });
  });

  test('cannot be combined with --scope', () => {
    const plan = disable(graph, { all: true, scope: 'user' });
    expect(plan.output).toMatchObject({ kind: 'usage-error' });
    expect(plan.writes).toEqual([]);
  });

  test('leaves a plugin the organization requires enabled', () => {
    const plan = disable(graph, { all: true }, { requiredByOrganization: new Set(['a@m']) });
    expect(plan.writes.map((write) => write.id)).toEqual(['b@m']);
  });
});

describe('what --all says when nothing is enabled (judgment)', () => {
  test('prints that there is nothing to disable and exits 0', () => {
    const none = world(['a@m', { scope: 'user', enabled: false }]);
    expect(human(disable(none, { all: true }))).toMatchObject({ exitCode: 0 });
  });
});
