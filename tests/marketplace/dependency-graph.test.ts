/**
 * plugins/install.md § Plugins with dependencies (Enable, Disable), plugins/cli-reference.md §
 * plugin enable (the three ways it fails) and § plugin disable (names the dependents to disable
 * first), plugins/dependencies.md § Combine constraints from several plugins. The requirement ids
 * of those commands belong to the install and cli streams, which consume `enablePlan` and
 * `disableDecision`; these tests assert the pure decisions and stay outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { enablePlan } from '../../src/marketplace/dependency-enable.ts';
import {
  constraintsOn,
  dependentsOf,
  disableDecision,
  effectiveEnabled,
} from '../../src/marketplace/dependency-graph.ts';
import { facts, installed } from '../support/dependency-facts.ts';

describe('enable (cli-reference.md, plugin enable)', () => {
  const app = installed('app@m', { deps: ['lib', 'tool@other'], scope: 'user' });

  test('installed but disabled dependencies are enabled, dependencies first', () => {
    const have = facts(
      [],
      [
        installed('app@m', { deps: ['lib'] }),
        installed('lib@m', { enabled: false, deps: ['core'] }),
        installed('core@m', { enabled: null }),
      ],
    );
    const result = enablePlan('app@m', 'user', have);
    expect(result).toEqual({ ok: true, enable: ['core@m', 'lib@m'], issues: [] });
  });

  test('a dependency already enabled is left alone', () => {
    const have = facts([], [installed('app@m', { deps: ['lib'] }), installed('lib@m')]);
    expect(enablePlan('app@m', 'user', have).enable).toEqual([]);
  });

  test('a dependency that is not installed fails the enable and prints the install command for each one', () => {
    const result = enablePlan('app@m', 'user', facts([], [app]));
    expect(result.ok).toBe(false);
    expect(result.enable).toEqual([]);
    expect(result.issues.map((one) => [one.block, one.dependency, one.command])).toEqual([
      ['not-installed', 'lib@m', 'claude plugin install lib@m'],
      ['not-installed', 'tool@other', 'claude plugin install tool@other'],
    ]);
    expect(result.issues[0]?.message).toContain('claude plugin install lib@m');
  });

  test('a dependency the organization policy blocks fails the enable and is named', () => {
    const have = facts([], [app, installed('lib@m', { enabled: false })], {
      blocked: new Set(['lib@m']),
    });
    const result = enablePlan('app@m', 'user', have);
    expect(result.issues.find((one) => one.block === 'policy-blocked')?.message).toContain(
      '"lib@m"',
    );
  });

  test('a dependency set to false at a scope above the target fails and names that scope', () => {
    const have = facts(
      [],
      [
        installed('app@m', { deps: ['lib'] }),
        installed('lib@m', { scope: 'user' }),
        installed('lib@m', { scope: 'local', enabled: false }),
      ],
    );
    const result = enablePlan('app@m', 'project', have);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ block: 'disabled-at-higher-scope', scope: 'local' });
    expect(result.issues[0]?.message).toContain('--scope local');
  });

  test('a false at the target scope itself or below is overwritten, not an error', () => {
    const have = facts(
      [],
      [
        installed('app@m', { deps: ['lib'] }),
        installed('lib@m', { scope: 'user', enabled: false }),
      ],
    );
    expect(enablePlan('app@m', 'project', have)).toMatchObject({ ok: true, enable: ['lib@m'] });
    expect(enablePlan('app@m', 'user', have)).toMatchObject({ ok: true, enable: ['lib@m'] });
  });

  test('a cycle ends', () => {
    const have = facts(
      [],
      [installed('a@m', { deps: ['b'] }), installed('b@m', { deps: ['a'], enabled: false })],
    );
    expect(enablePlan('a@m', 'user', have).enable).toEqual(['b@m']);
  });
});

describe('disable (install.md, cli-reference.md plugin disable)', () => {
  const have = facts(
    [],
    [
      installed('app@m', { deps: ['lib'] }),
      installed('lib@m', { deps: ['core'], auto: true }),
      installed('core@m', { auto: true }),
    ],
  );

  test('a plugin no enabled plugin needs may be disabled', () => {
    expect(disableDecision('app@m', have)).toEqual({ allowed: true });
  });

  test('another enabled plugin that depends on it refuses, naming the dependents and the chained command', () => {
    const result = disableDecision('core@m', have);
    expect(result).toMatchObject({
      allowed: false,
      dependents: ['lib@m'],
      chain: ['app@m', 'lib@m', 'core@m'],
      command:
        'claude plugin disable app@m && claude plugin disable lib@m && claude plugin disable core@m',
    });
    expect(result.allowed ? '' : result.message).toContain('"lib@m"');
  });

  test('a disabled dependent does not block', () => {
    const quiet = facts(
      [],
      [installed('app@m', { deps: ['lib'], enabled: false }), installed('lib@m')],
    );
    expect(dependentsOf('lib@m', quiet)).toEqual([]);
    expect(disableDecision('lib@m', quiet)).toEqual({ allowed: true });
  });

  test('a cycle between two enabled plugins ends in a chain that holds each once', () => {
    const loop = facts([], [installed('a@m', { deps: ['b'] }), installed('b@m', { deps: ['a'] })]);
    const result = disableDecision('a@m', loop);
    expect(result.allowed ? [] : result.chain).toEqual(['b@m', 'a@m']);
  });
});

describe('state reading', () => {
  test('the scope that wins writes the effective value: local over project over user, managed over all', () => {
    const have = facts(
      [],
      [
        installed('p@m', { scope: 'user', enabled: true }),
        installed('p@m', { scope: 'project', enabled: false }),
      ],
    );
    expect(effectiveEnabled('p@m', have)).toBe(false);
    expect(effectiveEnabled('absent@m', have)).toBeUndefined();
  });

  test('constraints are the ranges of installed plugins, once per plugin', () => {
    const have = facts(
      [],
      [
        installed('a@m', { deps: [{ name: 'lib', version: '^2.0' }] }),
        installed('a@m', { scope: 'project', deps: [{ name: 'lib', version: '^2.0' }] }),
        installed('b@m', { deps: [{ name: 'lib', version: '>=2.1' }, 'other'] }),
      ],
    );
    expect(constraintsOn('lib@m', have)).toEqual([
      { range: '^2.0', by: 'a@m' },
      { range: '>=2.1', by: 'b@m' },
    ]);
  });
});
