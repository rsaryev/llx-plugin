/**
 * plugins/dependencies.md § Constrain a dependency that has a non-git source (npm, archive and
 * command: the constraint does not choose the fetched version, it is checked at load against the
 * `plugin.json` version, none satisfies no constraint; a command source and a `headersHelper` entry
 * are never installed by Claude Code, and the same limits hold for every operation that installs
 * missing dependencies), § Depend on a plugin from another marketplace (the root marketplace's
 * `allowCrossMarketplaceDependenciesOn` alone decides; a refused entry dependency refuses the
 * install, a `plugin.json` one installs without it; an already enabled dependency bypasses it).
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import {
  DEPENDENCY_INSTALL_OPERATIONS,
  installClosure,
  type DependencyInstallOperation,
} from '../../src/marketplace/dependency-install-plan.ts';
import {
  checkDeclaredDependency,
  type GraphFacts,
} from '../../src/marketplace/dependency-graph.ts';
import { dep, facts, installed, plugin, type Installed } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const plan = (root: string, have: GraphFacts, operation: DependencyInstallOperation = 'install') =>
  installClosure({ root, scope: 'user', operation }, have);

const npm: PluginSource = { kind: 'npm', package: '@acme/lib' };
const archive: PluginSource = { kind: 'archive', url: 'https://example.com/lib.zip' };
const command: PluginSource = {
  kind: 'command',
  command: 'make lib',
  timeoutSeconds: 60,
  mode: 'copy',
};

const consumer = plugin('consumer', { manifest: [{ name: 'lib', version: '~2.1.0' }] });

spec('dependencies.guide.Constrain a dependency that has a non-git source', () => {
  const resolved = (source: PluginSource, currentCopyVersion?: string) =>
    plan(
      'consumer@m',
      facts([
        consumer,
        plugin('lib', {
          source,
          tags: ['lib--v2.1.0', 'lib--v2.1.9'],
          ...(currentCopyVersion === undefined ? {} : { currentCopyVersion }),
        }),
      ]),
    ).steps.find((one) => one.id === 'lib@m');

  test.each([
    ['npm', npm],
    ['archive', archive],
  ] as const)(
    '%s: the constraint does not control the fetched version, even when tags exist',
    (_kind, source) => {
      expect(resolved(source, '2.3.0')?.resolution).toEqual({
        via: 'current-copy',
        version: '2.3.0',
      });
    },
  );

  test('the version checked at load is the plugin.json version: outside the range the dependent plugin is disabled', () => {
    const step = resolved(npm, '2.3.0');
    expect(step?.loadIssues.map((one) => one.message)).toEqual([
      'Requires "lib@m" ~2.1.0, installed 2.3.0',
    ]);
    expect(resolved(npm, '2.1.5')?.loadIssues).toEqual([]);
  });

  test('a plugin.json that sets no version satisfies no constraint', () => {
    expect(resolved(archive)?.loadIssues.map((one) => one.message)).toEqual([
      'Requires "lib@m" ~2.1.0, installed (no version)',
    ]);
  });

  test('Claude Code never installs a dependency with a command source: the user installs it first', () => {
    const result = plan('consumer@m', facts([consumer, plugin('lib', { source: command })]));
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([]);
    expect(result.leftOut).toEqual([
      expect.objectContaining({
        id: 'lib@m',
        reason: 'command-source',
        command: 'claude plugin install lib@m',
      }),
    ]);
    expect(checkDeclaredDependency(dep({ name: 'lib', version: '~2.1.0' }), facts())?.message).toBe(
      'Dependency "lib@m" is not installed',
    );
  });

  test('it never runs a dependency headersHelper either, whatever its source', () => {
    const result = plan(
      'consumer@m',
      facts([consumer, plugin('lib', { headersHelper: './token.sh', source: archive })]),
    );
    expect(result.steps).toEqual([]);
    expect(result.leftOut.map((one) => [one.id, one.reason])).toEqual([
      ['lib@m', 'headers-helper'],
    ]);
  });

  test('a command-source dependency the user installed first is met, with its plugin.json version checked', () => {
    const have = facts(
      [consumer, plugin('lib', { source: command })],
      [installed('lib@m', { version: '2.1.2' })],
    );
    const result = plan('consumer@m', have);
    expect(result.steps).toEqual([]);
    expect(result.leftOut).toEqual([]);
    expect(checkDeclaredDependency(dep({ name: 'lib', version: '~2.1.0' }), have)).toBeUndefined();
  });

  describe('operations that also install missing declared dependencies', () => {
    const missing = facts([
      plugin('consumer', { manifest: ['lib', 'tool', 'gated'] }),
      plugin('lib', { source: npm, currentCopyVersion: '1.0.0' }),
      plugin('tool', { source: command }),
      plugin('gated', { source: archive, headersHelper: './h.sh' }),
    ]);

    test('the docs name install plus four more, each distinct', () => {
      expect(DEPENDENCY_INSTALL_OPERATIONS).toHaveLength(5);
      expect(new Set(DEPENDENCY_INSTALL_OPERATIONS).size).toBe(5);
    });

    test.each(DEPENDENCY_INSTALL_OPERATIONS)(
      '%s installs a missing registry dependency but leaves a command source and a headersHelper entry for the user',
      (operation) => {
        const result = plan('consumer@m', missing, operation);
        expect(result.steps.map((one) => [one.id, one.action])).toEqual([['lib@m', 'install']]);
        expect(result.leftOut.map((one) => [one.id, one.reason, one.command])).toEqual([
          ['tool@m', 'command-source', 'claude plugin install tool@m'],
          ['gated@m', 'headers-helper', 'claude plugin install gated@m'],
        ]);
        expect(result.ok).toBe(true);
      },
    );

    test('the docs give them one behaviour, so the plan is the same whichever runs it', () => {
      const outcome = (operation: DependencyInstallOperation) => {
        const { steps, leftOut, issues, ok } = plan('consumer@m', missing, operation);
        return { steps, leftOut, issues, ok };
      };
      const reference = outcome('install');
      for (const operation of DEPENDENCY_INSTALL_OPERATIONS) {
        expect(outcome(operation)).toEqual(reference);
      }
    });
  });
});

spec('dependencies.guide.Depend on a plugin from another marketplace', () => {
  const SHARED = 'your-shared-marketplace';
  const ROOT = 'your-marketplace';
  const audit = plugin('audit-logger', { marketplace: SHARED, currentCopyVersion: '1.0.0' });
  const deployKit = (where: 'entry' | 'manifest') =>
    plugin('deploy-kit', {
      marketplace: ROOT,
      [where]: [{ name: 'audit-logger', marketplace: SHARED }],
    });
  const REFUSAL =
    'Dependency "audit-logger@your-shared-marketplace" (required by deploy-kit@your-marketplace) is in marketplace "your-shared-marketplace", which is not in the allowlist';
  const run = (
    where: 'entry' | 'manifest',
    rest: Partial<GraphFacts> = {},
    have: readonly Installed[] = [],
  ) => plan(`deploy-kit@${ROOT}`, facts([deployKit(where), audit], have, rest));

  test('the root marketplace allowlist lets the dependency install', () => {
    const result = run('entry', { allowlists: { [ROOT]: [SHARED] } });
    expect(result.steps.map((one) => one.id)).toEqual([`audit-logger@${SHARED}`]);
  });

  test('declared in the marketplace entry and not allowed, the install itself is refused, naming the field to set', () => {
    for (const rest of [{}, { allowlists: { [ROOT]: ['another'] } }]) {
      const result = run('entry', rest);
      expect(result.ok).toBe(false);
      expect(result.steps).toEqual([]);
      expect(result.issues[0]?.message.startsWith(REFUSAL)).toBe(true);
      expect(result.issues[0]?.message).toContain('allowCrossMarketplaceDependenciesOn');
    }
  });

  test('declared in plugin.json and not allowed, the install completes without the dependency and the plugin then fails to load', () => {
    const result = run('manifest');
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([]);
    expect(result.leftOut).toEqual([
      expect.objectContaining({ id: `audit-logger@${SHARED}`, reason: 'cross-marketplace' }),
    ]);
    expect(
      checkDeclaredDependency(dep({ name: 'audit-logger', marketplace: SHARED }), facts())?.message,
    ).toBe(`Dependency "audit-logger@${SHARED}" is not installed`);
  });

  test('a dependency the user already enabled at the same scope needs no allowlist entry', () => {
    const have = [installed(`audit-logger@${SHARED}`, { scope: 'user' })];
    const result = run('entry', {}, have);
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([]);
  });

  test('enabled at another scope, or installed but disabled, does not bypass it', () => {
    expect(run('entry', {}, [installed(`audit-logger@${SHARED}`, { scope: 'project' })]).ok).toBe(
      false,
    );
    expect(run('entry', {}, [installed(`audit-logger@${SHARED}`, { enabled: false })]).ok).toBe(
      false,
    );
  });

  test('disabled at this scope but enabled by another scope is not enabled at the same scope, so it does not bypass it either', () => {
    const id = `audit-logger@${SHARED}`;
    const have = [
      installed(id, { scope: 'user', enabled: false }),
      installed(id, { scope: 'project', enabled: true }),
    ];
    const result = run('entry', {}, have);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message.startsWith(REFUSAL)).toBe(true);
    expect(run('entry', { allowlists: { [ROOT]: [SHARED] } }, have).ok).toBe(true);
  });

  test('only the root marketplace allowlist applies, down the whole chain', () => {
    const chain = [
      deployKit('entry'),
      plugin('audit-logger', {
        marketplace: SHARED,
        manifest: [{ name: 'log-core', marketplace: 'third' }],
      }),
      plugin('log-core', { marketplace: 'third', currentCopyVersion: '1.0.0' }),
    ];
    const allowed = (lists: Record<string, readonly string[]>) =>
      plan(`deploy-kit@${ROOT}`, facts(chain, [], { allowlists: lists }));
    const shared = allowed({ [ROOT]: [SHARED], [SHARED]: ['third'] });
    expect(shared.steps.map((one) => one.id)).toEqual([`audit-logger@${SHARED}`]);
    expect(shared.leftOut.map((one) => [one.id, one.reason])).toEqual([
      ['log-core@third', 'cross-marketplace'],
    ]);
    expect(allowed({ [ROOT]: [SHARED, 'third'] }).steps.map((one) => one.id)).toEqual([
      'log-core@third',
      `audit-logger@${SHARED}`,
    ]);
  });
});
