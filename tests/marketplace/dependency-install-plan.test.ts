/**
 * plugins/install.md § Plugins with dependencies ("Install: Claude Code also installs and enables
 * the plugin's declared dependencies at the same scope"), plugins/dependencies.md § Combine
 * constraints from several plugins. The transitive walk, its order and its reasons are the kit's
 * (the docs do not describe cycles or depth): judgments in spec/judgments.md, so no `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { installClosure } from '../../src/marketplace/dependency-install-plan.ts';
import { facts, installed, plugin } from '../support/dependency-facts.ts';

const plan = (have: ReturnType<typeof facts>, root = 'app@m') =>
  installClosure({ root, scope: 'user', operation: 'install' }, have);
const ids = (result: ReturnType<typeof plan>) => result.steps.map((one) => one.id);

describe('transitive install plan', () => {
  test('dependencies of dependencies are planned, each before the plugin that needs it', () => {
    const result = plan(
      facts([
        plugin('app', { manifest: ['lib'] }),
        plugin('lib', { manifest: ['core'] }),
        plugin('core', { manifest: ['base'] }),
        plugin('base'),
      ]),
    );
    expect(ids(result)).toEqual(['base@m', 'core@m', 'lib@m']);
    expect(result.steps.map((one) => one.requiredBy)).toEqual([['core@m'], ['lib@m'], ['app@m']]);
    expect(result.steps.every((one) => one.action === 'install')).toBe(true);
  });

  test('a cycle ends: each plugin is planned once and the root is not planned as its own dependency', () => {
    const result = plan(
      facts([
        plugin('app', { manifest: ['a'] }),
        plugin('a', { manifest: ['b'] }),
        plugin('b', { manifest: ['a', 'app'] }),
      ]),
    );
    expect(ids(result)).toEqual(['b@m', 'a@m']);
    expect(result.ok).toBe(true);
  });

  test('a diamond is planned once, with the ranges and askers of both branches', () => {
    const result = plan(
      facts([
        plugin('app', { manifest: ['left', 'right'] }),
        plugin('left', { manifest: [{ name: 'shared', version: '^2.0' }] }),
        plugin('right', { manifest: [{ name: 'shared', version: '>=2.1' }] }),
        plugin('shared', { tags: ['shared--v2.0.0', 'shared--v2.4.0', 'shared--v3.0.0'] }),
      ]),
    );
    expect(ids(result)).toEqual(['shared@m', 'left@m', 'right@m']);
    expect(result.steps[0]).toMatchObject({
      requiredBy: ['left@m', 'right@m'],
      ranges: ['^2.0', '>=2.1'],
      resolution: { version: '2.4.0' },
    });
  });

  test('a diamond whose branches conflict refuses the whole plan', () => {
    const result = plan(
      facts([
        plugin('app', { manifest: ['left', 'right'] }),
        plugin('left', { manifest: [{ name: 'shared', version: '~2.1' }] }),
        plugin('right', { manifest: [{ name: 'shared', version: '~3.0' }] }),
        plugin('shared', {}),
      ]),
    );
    expect(result.steps).toEqual([]);
    expect(result.issues[0]?.message).toContain('has conflicting version requirements');
  });

  test('a dependency already installed, enabled and in range needs no step and is not walked', () => {
    const result = plan(
      facts(
        [plugin('app', { manifest: ['lib'] }), plugin('lib', { manifest: ['gone'] })],
        [installed('lib@m', { version: '1.0.0' })],
      ),
    );
    expect(result.steps).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('an installed dependency that is disabled is enabled, with its own dependencies', () => {
    const result = plan(
      facts(
        [
          plugin('app', { manifest: ['lib'] }),
          plugin('lib', { manifest: ['core'] }),
          plugin('core'),
        ],
        [installed('lib@m', { enabled: false, deps: ['core'] })],
      ),
    );
    expect(result.steps.map((one) => [one.id, one.action])).toEqual([
      ['core@m', 'install'],
      ['lib@m', 'enable'],
    ]);
    expect(result.steps[1]?.resolution).toBeUndefined();
  });

  test('an installed dependency outside the ranges is updated', () => {
    const result = plan(
      facts(
        [
          plugin('app', { manifest: [{ name: 'lib', version: '^2.0' }] }),
          plugin('lib', { tags: ['lib--v1.0.0', 'lib--v2.3.0'] }),
        ],
        [installed('lib@m', { version: '1.0.0' })],
      ),
    );
    expect(result.steps.map((one) => [one.id, one.action, one.version])).toEqual([
      ['lib@m', 'update', '2.3.0'],
    ]);
  });

  test('a plugin installed at another scope is installed at this one too', () => {
    const result = plan(
      facts(
        [plugin('app', { manifest: ['lib'] }), plugin('lib')],
        [installed('lib@m', { scope: 'project', version: '1.0.0' })],
      ),
    );
    expect(ids(result)).toEqual(['lib@m']);
  });

  test('a dependency its marketplace does not list refuses the install, naming it', () => {
    const result = plan(facts([plugin('app', { manifest: ['ghost'] })]));
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('Dependency "ghost@m"');
  });

  test('a root missing from the catalog and not installed is an issue', () => {
    expect(plan(facts(), 'nobody@m').issues[0]?.message).toContain('nobody@m');
  });

  test('an installed root whose marketplace dropped it is planned from its recorded dependencies', () => {
    const result = plan(facts([plugin('lib')], [installed('app@m', { deps: ['lib'] })]));
    expect(ids(result)).toEqual(['lib@m']);
  });

  test('a tag with a known commit shows the 12-character suffix, one without shows the bare version', () => {
    const catalog = (commits?: Record<string, string>) =>
      facts([
        plugin('app', { manifest: [{ name: 'lib', version: '^1.0' }] }),
        plugin('lib', {
          tags: ['lib--v1.2.0'],
          ...(commits === undefined ? {} : { tagCommits: commits }),
        }),
      ]);
    expect(plan(catalog({ 'lib--v1.2.0': 'ABCDEF0123456789' })).steps[0]?.version).toBe(
      '1.2.0-abcdef012345',
    );
    expect(plan(catalog()).steps[0]?.version).toBe('1.2.0');
  });

  test('conflicting ranges refuse the plan for a source whose version no tag chooses too', () => {
    const result = plan(
      facts([
        plugin('app', { manifest: ['left', 'right'] }),
        plugin('left', { manifest: [{ name: 'shared', version: '~2.1' }] }),
        plugin('right', { manifest: [{ name: 'shared', version: '~3.0' }] }),
        plugin('shared', { source: { kind: 'npm', package: '@acme/shared' } }),
      ]),
    );
    expect(result.steps).toEqual([]);
    expect(result.issues[0]?.message).toContain('has conflicting version requirements');
  });
});
