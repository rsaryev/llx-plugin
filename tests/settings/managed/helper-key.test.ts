/**
 * settings-reference.md, the entries `policyHelper`, `policyHelper.path`, `policyHelper.timeoutMs`
 * and `policyHelper.refreshIntervalMs`: where the key is read, what a valid value is, what an
 * invalid one costs.
 */
import { describe, expect, test } from 'bun:test';
import { loadSettingsLayers, type PolicyScope } from '../../../src/settings/index.ts';
import {
  HELPER_DEFAULT_TIMEOUT_MS,
  HELPER_MIN_REFRESH_MS,
  HELPER_MIN_TIMEOUT_MS,
  helperPathFault,
  composeManagedReads,
  helperRunsNow,
  readPolicyHelper,
  type ManagedReads,
} from '../../../src/settings/managed/index.ts';
import { compose } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const PATH = '/usr/local/bin/claude-policy';

spec(['policy.key.policyHelper', 'policy.server.Current limitations'], () => {
  test('the object takes path, timeoutMs and refreshIntervalMs', () => {
    const read = readPolicyHelper({ path: PATH, timeoutMs: 5000, refreshIntervalMs: 300_000 });
    expect(read).toEqual({ helper: { path: PATH, timeoutMs: 5000, refreshIntervalMs: 300_000 } });
  });

  test('unset, no helper runs', () => {
    const plan = compose({ file: { model: 'a' } }).helper;
    expect(plan.helper).toBeUndefined();
    expect(plan.runsAtLaunch).toBe(false);
  });

  test('it is read from the macOS plist, the Windows HKLM registry or the managed settings file', () => {
    for (const source of ['plist', 'hklm', 'file'] as const) {
      const plan = compose({ [source]: { policyHelper: { path: PATH } } }).helper;
      expect(plan.helper?.path).toBe(PATH);
      expect(plan.runsAtLaunch).toBe(true);
    }
  });

  test('it is ignored in server-managed settings, the HKCU registry and host-supplied parent settings', () => {
    const remote = compose({ remote: { policyHelper: { path: PATH } } }).helper;
    expect(remote.helper).toBeUndefined();
    expect(remote.runsAtLaunch).toBe(false);
    const hkcu = compose({ hkcu: { policyHelper: { path: PATH } } }).helper;
    expect(hkcu.helper).toBeUndefined();
  });

  test('a host-supplied parent layer that carries it never runs it, beside an admin source that merges parent settings or alone', async () => {
    const parent = { model: 'x', policyHelper: { path: PATH } };
    for (const managed of [
      { file: { base: { value: { model: 'a', parentSettingsBehavior: 'merge' } } } },
      {},
    ] satisfies ManagedReads[]) {
      const sources = {
        read: (scope: PolicyScope) => Promise.resolve(scope === 'parent' ? parent : undefined),
        managed: () => Promise.resolve(managed),
      };
      const { layers } = await loadSettingsLayers(sources, {
        signal: new AbortController().signal,
      });
      expect(layers.some((layer) => layer.scope === 'parent' || layer.scope === 'managed')).toBe(
        true,
      );
      const plan = composeManagedReads(managed, { parentRestrictive: true }).helper;
      expect(plan.helper).toBeUndefined();
      expect(plan.runsAtLaunch).toBe(false);
      expect(helperRunsNow(plan, { remoteStillDelivers: false })).toBe(false);
    }
  });

  test('it is read from the highest-priority source that carries a policy key, which must be one of the three', () => {
    const lowerFile = compose({
      plist: { model: 'a' },
      file: { policyHelper: { path: PATH } },
    }).helper;
    expect(lowerFile.helper).toBeUndefined();
  });

  test('server-managed settings that deliver the policy at launch shadow the helper, so it does not run', () => {
    const plan = compose({ remote: { model: 'a' }, file: { policyHelper: { path: PATH } } }).helper;
    expect(plan.helper?.path).toBe(PATH);
    expect(plan.shadowedByRemote).toBe(true);
    expect(plan.runsAtLaunch).toBe(false);
    expect(helperRunsNow(plan, { remoteStillDelivers: true })).toBe(false);
  });

  test('a fetch that reports the server-managed settings removed runs the helper at that point', () => {
    const plan = compose({ remote: { model: 'a' }, file: { policyHelper: { path: PATH } } }).helper;
    expect(helperRunsNow(plan, { remoteStillDelivers: false })).toBe(true);
  });

  test('a helper that runs at launch needs no fetch', () => {
    const plan = compose({ file: { policyHelper: { path: PATH } } }).helper;
    expect(helperRunsNow(plan, { remoteStillDelivers: true })).toBe(true);
  });

  test('an invalid value, such as a bare path, is a dropped entry and no helper runs', () => {
    const composed = compose({ file: { model: 'a', policyHelper: PATH } });
    expect(composed.helper.helper).toBeUndefined();
    expect(composed.layer.settings.model).toBe('a');
    expect(composed.layer.settings.policyHelper).toBeUndefined();
    expect(composed.issues.some((issue) => issue.path.endsWith('policyHelper'))).toBe(true);
    const read = readPolicyHelper(PATH);
    expect('issue' in read && read.issue.severity).toBe('warning');
  });

  test('turning a helper off is removing the key', () => {
    expect(compose({ file: { model: 'a' } }).helper.helper).toBeUndefined();
  });
});

spec('policy.key.policyHelper.path', () => {
  test('an absolute path in normalized form is valid', () => {
    expect(helperPathFault(PATH, 'posix')).toBeUndefined();
  });

  test('a relative path, a "." or ".." segment, or a non-normalized form breaks the rules', () => {
    for (const path of [
      'bin/claude-policy',
      './claude-policy',
      '/usr/../bin/p',
      '/usr/./bin/p',
      '/usr//bin/p',
      '/usr/bin/',
    ]) {
      expect(helperPathFault(path, 'posix')).toBeDefined();
    }
  });

  test('on Windows a drive-letter or UNC path that ends in .exe is valid', () => {
    expect(helperPathFault('C:\\Tools\\claude-policy.exe', 'windows')).toBeUndefined();
    expect(helperPathFault('\\\\server\\share\\claude-policy.exe', 'windows')).toBeUndefined();
  });

  test('on Windows anything else breaks the rules', () => {
    for (const path of [
      'C:\\Tools\\claude-policy',
      'claude-policy.exe',
      'C:\\Tools\\..\\p.exe',
      '/usr/bin/p.exe',
    ]) {
      expect(helperPathFault(path, 'windows')).toBeDefined();
    }
  });

  test('the path is required when policyHelper is set', () => {
    expect('issue' in readPolicyHelper({ timeoutMs: 5000 })).toBe(true);
    expect('issue' in readPolicyHelper({ path: 7 })).toBe(true);
  });
});

spec('policy.key.policyHelper.timeoutMs', () => {
  test('the default is 10000 and the minimum 1000', () => {
    expect(HELPER_DEFAULT_TIMEOUT_MS).toBe(10_000);
    expect(HELPER_MIN_TIMEOUT_MS).toBe(1000);
    expect(readPolicyHelper({ path: PATH })).toEqual({ helper: { path: PATH, timeoutMs: 10_000 } });
  });

  test('1000 is accepted; a value below it, a fraction or text is invalid', () => {
    expect('helper' in readPolicyHelper({ path: PATH, timeoutMs: 1000 })).toBe(true);
    for (const timeoutMs of [999, 0, -1, 1500.5, '5000']) {
      expect('issue' in readPolicyHelper({ path: PATH, timeoutMs })).toBe(true);
    }
  });

  test('an invalid timeoutMs drops the whole entry and the session starts on the remaining settings', () => {
    const composed = compose({
      file: { model: 'a', policyHelper: { path: PATH, timeoutMs: 500 } },
    });
    expect(composed.helper.helper).toBeUndefined();
    expect(composed.layer.settings.model).toBe('a');
  });
});

spec('policy.key.policyHelper.refreshIntervalMs', () => {
  test('0 disables refresh and at least 60000 re-runs the helper on that interval', () => {
    expect(HELPER_MIN_REFRESH_MS).toBe(60_000);
    for (const refreshIntervalMs of [0, 60_000, 300_000]) {
      expect(readPolicyHelper({ path: PATH, refreshIntervalMs })).toEqual({
        helper: { path: PATH, timeoutMs: 10_000, refreshIntervalMs },
      });
    }
  });

  test('a value between 1 and 59999, a fraction or text is invalid', () => {
    for (const refreshIntervalMs of [1, 59_999, 60_000.5, '60000', -5]) {
      expect('issue' in readPolicyHelper({ path: PATH, refreshIntervalMs })).toBe(true);
    }
  });

  test('unset, the helper runs once at startup', () => {
    const read = readPolicyHelper({ path: PATH });
    expect('helper' in read && read.helper.refreshIntervalMs).toBeUndefined();
  });
});

describe('the option bag is read from the managed document', () => {
  test('a document with a valid helper keeps the helper key in the managed settings', () => {
    const composed = compose({ file: { policyHelper: { path: PATH, timeoutMs: 5000 } } });
    expect(composed.layer.settings.policyHelper).toEqual({ path: PATH, timeoutMs: 5000 });
  });
});
