/** plugins/manifest-reference.md § defaultEnabled: a required dependency is enabled irrespective of its default. */
import { expect, test } from 'bun:test';
import { planInstall } from '../../src/marketplace/dependency-plans.ts';
import { app, node } from '../support/dependency-nodes.ts';
import { spec } from '../support/spec.ts';

spec('manifest.rule.defaultEnabled', () => {
  test('install enables a dependency whose author defaults it off, while a root defaulting off stays off', () => {
    const root = app({ installed: false, enabled: false, defaultEnabled: false });
    const dependency = node('lib@acme', {
      installed: false,
      enabled: false,
      defaultEnabled: false,
    });
    expect(planInstall('app@acme', 'user', [root, dependency]).enable).toEqual(['lib@acme']);
    expect(planInstall('lib@acme', 'user', [dependency]).enable).toEqual([]);
  });
});
