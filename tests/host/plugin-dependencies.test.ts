/**
 * A plugin whose dependency is not met does not run (plugins/troubleshooting.md, "Dependency
 * errors": "Claude Code keeps the affected plugin disabled until you resolve it"; the messages
 * `Dependency "<dep>" is not installed`, `... is disabled — enable it or remove the dependency`,
 * `Requires "<dep>" <range>, installed <version>`). Oracle 2.1.322 (spec/judgments.md), a black-box
 * probe with a private HOME and config folder: `a@mk` depends on `b`; with `b@mk` uninstalled, or
 * set to `false` in `enabledPlugins`, `claude plugin list --json` shows the error on `a@mk` and a
 * `claude -p` session against a local fake Messages API lists neither `a:sa` nor `b:sb`. Tested
 * outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { pluginsWithDependencies, type HostPlugin } from '../../src/host/index.ts';
import { hostOf, loaded } from '../support/host.ts';

async function pluginOf(
  id: string,
  manifest: Record<string, unknown>,
  enabled?: boolean,
): Promise<HostPlugin> {
  const plugin = await loaded({ '.claude-plugin/plugin.json': JSON.stringify(manifest) });
  return { id, plugin, ...(enabled === undefined ? {} : { enabled }) };
}

const runs = async (plugins: readonly HostPlugin[]) => {
  const { host } = await hostOf({ plugins });
  return {
    on: host.plugins.filter((each) => each.enabled).map((each) => each.id),
    issues: host.issues.map((issue) => `${issue.path}: ${issue.message}`),
  };
};

describe('a dependency at load (oracle 2.1.322)', () => {
  test('met by an enabled plugin: both run', async () => {
    const a = await pluginOf('a@mk', { name: 'a', dependencies: ['b'] });
    const b = await pluginOf('b@mk', { name: 'b' });
    expect(await runs([a, b])).toEqual({ on: ['a@mk', 'b@mk'], issues: [] });
  });

  test('not given: the dependent is off with `is not installed`', async () => {
    const a = await pluginOf('a@mk', { name: 'a', dependencies: ['b'] });
    expect(await runs([a])).toEqual({
      on: [],
      issues: ['a@mk: Dependency "b@mk" is not installed'],
    });
  });

  test('given disabled: the dependent is off with `is disabled`', async () => {
    const a = await pluginOf('a@mk', { name: 'a', dependencies: ['b'] });
    const b = await pluginOf('b@mk', { name: 'b' }, false);
    expect(await runs([a, b])).toEqual({
      on: [],
      issues: ['a@mk: Dependency "b@mk" is disabled — enable it or remove the dependency'],
    });
  });

  test('outside the range: off with `Requires`', async () => {
    const a = await pluginOf('a@mk', {
      name: 'a',
      dependencies: [{ name: 'b', version: '^2.0.0' }],
    });
    const b = await pluginOf('b@mk', { name: 'b', version: '1.0.0' });
    expect(await runs([a, b])).toEqual({
      on: ['b@mk'],
      issues: ['a@mk: Requires "b@mk" ^2.0.0, installed 1.0.0'],
    });
  });

  test('a plugin that needs one that does not run stops too', async () => {
    const c = await pluginOf('c@mk', { name: 'c', dependencies: ['a'] });
    const a = await pluginOf('a@mk', { name: 'a', dependencies: ['b'] });
    expect(await runs([c, a])).toEqual({
      on: [],
      issues: [
        'a@mk: Dependency "b@mk" is not installed',
        'c@mk: Dependency "a@mk" is disabled — enable it or remove the dependency',
      ],
    });
  });

  test('a --plugin-dir copy meets the entry whatever its version', async () => {
    const a = await pluginOf('a@mk', {
      name: 'a',
      dependencies: [{ name: 'b', version: '^2.0.0' }],
    });
    const b = await pluginOf('b@inline', { name: 'b', version: '1.0.0' });
    expect(await runs([a, b])).toEqual({ on: ['a@mk', 'b@inline'], issues: [] });
    const off = await pluginOf('b@inline', { name: 'b' }, false);
    expect((await runs([a, off])).issues).toEqual([
      'a@mk: Dependency "b@inline" is disabled — enable it or remove the dependency',
    ]);
  });
});

describe('pluginsWithDependencies: the same verdict without a host', () => {
  test('a missing and a disabled dependency turn their dependents off, with the error and its type', async () => {
    const a = await pluginOf('a@mk', { name: 'a', dependencies: ['b'] });
    const c = await pluginOf('c@mk', { name: 'c', dependencies: ['d'] });
    const d = await pluginOf('d@mk', { name: 'd' });
    const verdict = pluginsWithDependencies([
      { id: a.id, plugin: a.plugin, enabled: true },
      { id: c.id, plugin: c.plugin, enabled: true },
      { id: d.id, plugin: d.plugin, enabled: false },
    ]);
    expect(verdict.plugins).toEqual([
      { id: 'a@mk', name: 'a', enabled: false },
      { id: 'c@mk', name: 'c', enabled: false },
      { id: 'd@mk', name: 'd', enabled: false },
    ]);
    expect(
      verdict.issues.map(({ path, message, errorType }) => [path, message, errorType]),
    ).toEqual([
      ['a@mk', 'Dependency "b@mk" is not installed', 'dependency-unsatisfied'],
      [
        'c@mk',
        'Dependency "d@mk" is disabled — enable it or remove the dependency',
        'dependency-unsatisfied',
      ],
    ]);
  });

  test('agrees with a session over the same plugins', async () => {
    const c = await pluginOf('c@mk', { name: 'c', dependencies: ['a'] });
    const a = await pluginOf('a@mk', {
      name: 'a',
      dependencies: [{ name: 'b', version: '^2.0.0' }],
    });
    const b = await pluginOf('b@mk', { name: 'b', version: '1.0.0' });
    const given = [c, a, b];
    const { host } = await hostOf({ plugins: given });
    const verdict = pluginsWithDependencies(given.map((one) => ({ ...one, enabled: true })));
    expect(verdict.plugins).toEqual(host.plugins);
    expect(verdict.issues.map(({ path, message }) => ({ path, message }))).toEqual(
      host.issues.map(({ path, message }) => ({ path, message })),
    );
  });
});
