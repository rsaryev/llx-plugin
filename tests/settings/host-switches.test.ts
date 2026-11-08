/**
 * env-vars.md § Variables: the host-wide switches `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL`,
 * `CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS`, `CLAUDE_CODE_DISABLE_POLICY_SKILLS`,
 * `CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`,
 * `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`, `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`, `CLAUDE_CODE_SYNC_PLUGIN_INSTALL`
 * (and its timeout), `DISABLE_TELEMETRY`, `DO_NOT_TRACK`.
 */
import { expect, test } from 'bun:test';
import {
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
  DEFAULT_PLUGIN_GIT_TIMEOUT_MS,
  backgroundPluginRefreshEnabled,
  claudeTempDirectory,
  maxConcurrentSubagents,
  officialMarketplaceAutoinstallEnabled,
  permissionPromptNotifyHooksEnabled,
  pluginGitTimeoutMs,
  pluginSeedDirectories,
  policySkillsEnabled,
  preferHttps,
  syncPluginInstall,
  telemetryOptedOut,
} from '../../src/settings/host-switches.ts';
import { fakeEnvironment } from '../../src/testing/ports/index.ts';
import { spec } from '../support/spec.ts';

const env = (name: string, value: string) => fakeEnvironment({ [name]: value });
const none = fakeEnvironment();

spec('environment.host.CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL', () => {
  test('1 turns the registration off, anything else leaves it on', () => {
    const name = 'CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL';
    expect(officialMarketplaceAutoinstallEnabled(none)).toBe(true);
    expect(officialMarketplaceAutoinstallEnabled(env(name, '1'))).toBe(false);
    expect(officialMarketplaceAutoinstallEnabled(env(name, '0'))).toBe(true);
  });
});

spec('environment.host.CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS', () => {
  const name = 'CLAUDE_CODE_DISABLE_PERMISSION_PROMPT_NOTIFY_HOOKS';
  test('1 stops the hooks where requests go to canUseTool', () => {
    expect(permissionPromptNotifyHooksEnabled(env(name, '1'), { usesCanUseTool: true })).toBe(
      false,
    );
  });
  test('it has no effect in terminal sessions or when unset', () => {
    expect(permissionPromptNotifyHooksEnabled(env(name, '1'), { usesCanUseTool: false })).toBe(
      true,
    );
    expect(permissionPromptNotifyHooksEnabled(none, { usesCanUseTool: true })).toBe(true);
  });
});

spec('environment.host.CLAUDE_CODE_DISABLE_POLICY_SKILLS', () => {
  test('1 skips the managed skills directory', () => {
    expect(policySkillsEnabled(none)).toBe(true);
    expect(policySkillsEnabled(env('CLAUDE_CODE_DISABLE_POLICY_SKILLS', '1'))).toBe(false);
  });
});

spec('environment.host.CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH', () => {
  const name = 'CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH';
  test('it is off by default and on for 1 in non-interactive mode', () => {
    expect(backgroundPluginRefreshEnabled(none, { interactive: false })).toBe(false);
    expect(backgroundPluginRefreshEnabled(env(name, '1'), { interactive: false })).toBe(true);
    expect(backgroundPluginRefreshEnabled(env(name, '1'), { interactive: true })).toBe(false);
  });
});

spec('environment.host.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS', () => {
  const name = 'CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS';
  test('the default is 20', () => {
    expect(maxConcurrentSubagents(none)).toBe(DEFAULT_MAX_CONCURRENT_SUBAGENTS);
    expect(DEFAULT_MAX_CONCURRENT_SUBAGENTS).toBe(20);
  });
  test('a positive whole number in plain digits sets the cap', () => {
    expect(maxConcurrentSubagents(env(name, '5'))).toBe(5);
  });
  test.each(['0', '-3', '2.5', '1e3', '+4', 'ten', ''])('%p is ignored', (value) => {
    expect(maxConcurrentSubagents(env(name, value))).toBe(20);
  });
});

spec('environment.host.CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS', () => {
  const name = 'CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS';
  test('the default is 120000 milliseconds', () => {
    expect(pluginGitTimeoutMs(none)).toBe(DEFAULT_PLUGIN_GIT_TIMEOUT_MS);
    expect(DEFAULT_PLUGIN_GIT_TIMEOUT_MS).toBe(120000);
  });
  test('a larger value raises it; an invalid one keeps the default', () => {
    expect(pluginGitTimeoutMs(env(name, '300000'))).toBe(300000);
    expect(pluginGitTimeoutMs(env(name, 'soon'))).toBe(120000);
  });
});

spec('environment.host.CLAUDE_CODE_PLUGIN_PREFER_HTTPS', () => {
  test('1 prefers HTTPS', () => {
    expect(preferHttps(none)).toBe(false);
    expect(preferHttps(env('CLAUDE_CODE_PLUGIN_PREFER_HTTPS', '1'))).toBe(true);
  });
});

spec(
  [
    'environment.host.CLAUDE_CODE_SYNC_PLUGIN_INSTALL',
    'environment.host.CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS',
  ],
  () => {
    const on = { CLAUDE_CODE_SYNC_PLUGIN_INSTALL: '1' };
    test('1 waits in non-interactive mode only', () => {
      expect(syncPluginInstall(fakeEnvironment(on), { interactive: false })).toEqual({
        wait: true,
      });
      expect(syncPluginInstall(fakeEnvironment(on), { interactive: true })).toEqual({
        wait: false,
      });
      expect(syncPluginInstall(none, { interactive: false })).toEqual({ wait: false });
    });
    test('the timeout bounds the wait; without it there is none', () => {
      const bounded = fakeEnvironment({
        ...on,
        CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS: '5000',
      });
      expect(syncPluginInstall(bounded, { interactive: false })).toEqual({
        wait: true,
        timeoutMs: 5000,
      });
    });
  },
);

spec('environment.host.DISABLE_TELEMETRY', () => {
  test.each(['1', '0', 'false', 'yes'])('%p opts out', (value) => {
    expect(telemetryOptedOut(env('DISABLE_TELEMETRY', value))).toBe(true);
  });
  test('unset or empty leaves telemetry on', () => {
    expect(telemetryOptedOut(none)).toBe(false);
    expect(telemetryOptedOut(env('DISABLE_TELEMETRY', ''))).toBe(false);
  });
});

spec('environment.host.DO_NOT_TRACK', () => {
  test('1 opts out and 0 leaves telemetry on', () => {
    expect(telemetryOptedOut(env('DO_NOT_TRACK', '1'))).toBe(true);
    expect(telemetryOptedOut(env('DO_NOT_TRACK', '0'))).toBe(false);
  });
});

spec('environment.host.CLAUDE_CODE_PLUGIN_SEED_DIR', () => {
  const name = 'CLAUDE_CODE_PLUGIN_SEED_DIR';
  test('seeds are separated by : on Unix and ; on Windows, in order', () => {
    expect(pluginSeedDirectories(env(name, '/opt/a:/opt/b'), 'posix')).toEqual([
      '/opt/a',
      '/opt/b',
    ]);
    expect(pluginSeedDirectories(env(name, 'C:\\a;D:\\b'), 'windows')).toEqual(['C:\\a', 'D:\\b']);
    expect(pluginSeedDirectories(env(name, 'C:\\a;D:\\b'), 'posix')).toEqual(['C', '\\a;D', '\\b']);
  });
  test('unset or empty is no seed', () => {
    expect(pluginSeedDirectories(none, 'posix')).toEqual([]);
    expect(pluginSeedDirectories(env(name, '::'), 'posix')).toEqual([]);
  });
});

spec('environment.host.CLAUDE_CODE_TMPDIR', () => {
  test('appends /claude-{uid}/ on Unix and /claude/ on Windows to the override', () => {
    const set = env('CLAUDE_CODE_TMPDIR', '/var/scratch/');
    expect(claudeTempDirectory(set, { platform: 'posix', uid: 501, fallback: '/tmp' })).toBe(
      '/var/scratch/claude-501/',
    );
    expect(claudeTempDirectory(set, { platform: 'windows', uid: 0, fallback: 'C:/T' })).toBe(
      '/var/scratch/claude/',
    );
  });
  test('without the override the host default is the base', () => {
    expect(claudeTempDirectory(none, { platform: 'posix', uid: 7, fallback: '/tmp' })).toBe(
      '/tmp/claude-7/',
    );
  });
});
