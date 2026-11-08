/**
 * plugins/troubleshooting.md § Dependency errors: `Dependency "<dep>" is not installed`,
 * `Dependency "<dep>" is disabled` (a `--plugin-dir` copy names itself `<name>@inline`) and the
 * `errorDetails.type` of `claude plugin list --json`. The `is not installed` and `is disabled` rows
 * are proven here; the range rows in dependency-tags.test.ts and dependency-guide-resolution.test.ts.
 */
import { expect, test } from 'bun:test';
import { spec } from '../support/spec.ts';
import {
  checkDependency,
  checkInstalledDependency,
  dependencyId,
} from '../../src/marketplace/dependencies.ts';

const MARKETPLACE = 'your-marketplace';

spec(
  [
    'install.troubleshooting.Dependency errors.Dependency "<dep>" is not installed',
    'install.troubleshooting.Dependency errors.Dependency "<dep>" is disabled',
  ],
  () => {
    test('a dependency is identified as `name@marketplace`, or by `name` alone with no marketplace', () => {
      expect(dependencyId({ name: 'audit-logger', marketplace: MARKETPLACE })).toBe(
        'audit-logger@your-marketplace',
      );
      expect(dependencyId({ name: 'audit-logger' })).toBe('audit-logger');
    });

    test('a missing dependency is `Dependency "<dep>" is not installed`', () => {
      expect(
        checkInstalledDependency({ name: 'audit-logger', marketplace: MARKETPLACE }, undefined),
      ).toEqual({
        severity: 'error',
        path: 'dependencies.audit-logger@your-marketplace',
        message: 'Dependency "audit-logger@your-marketplace" is not installed',
        errorType: 'dependency-unsatisfied',
      });
    });

    test('a disabled dependency is `Dependency "<dep>" is disabled`, ending "enable it or remove the dependency"', () => {
      const found = checkInstalledDependency(
        { name: 'audit-logger', marketplace: MARKETPLACE },
        { version: '1.0.0', enabled: false },
      );
      expect(found?.message).toBe(
        'Dependency "audit-logger@your-marketplace" is disabled — enable it or remove the dependency',
      );
      expect(found?.errorType).toBe('dependency-unsatisfied');
    });

    test('a disabled `--plugin-dir` copy names itself as `<name>@inline` in the error', () => {
      const found = checkInstalledDependency(
        { name: 'my-dependency', marketplace: MARKETPLACE },
        { enabled: false, local: true, id: 'my-dependency@inline' },
      );
      expect(found?.message).toBe(
        'Dependency "my-dependency@inline" is disabled — enable it or remove the dependency',
      );
    });

    test('the errorType is dependency-unsatisfied for not installed, disabled and @synced, and dependency-version-unsatisfied for a range', () => {
      const dep = { name: 'a', marketplace: MARKETPLACE, range: '^2.0' };
      expect(checkInstalledDependency(dep, undefined)?.errorType).toBe('dependency-unsatisfied');
      expect(checkInstalledDependency(dep, { version: '2.0.0', enabled: false })?.errorType).toBe(
        'dependency-unsatisfied',
      );
      expect(checkInstalledDependency(dep, { version: '3.0.0', enabled: true })?.errorType).toBe(
        'dependency-version-unsatisfied',
      );
      const synced = checkDependency(dep, { claudeAi: { version: '2.0.0', enabled: true } }, false);
      expect(synced?.errorType).toBe('dependency-unsatisfied');
    });

    test('the kit names a dependency `name@marketplace`, or `name` alone with no marketplace', () => {
      expect(dependencyId({ name: 'audit-logger', marketplace: MARKETPLACE })).toBe(
        'audit-logger@your-marketplace',
      );
      expect(dependencyId({ name: 'audit-logger' })).toBe('audit-logger');
    });
  },
);
