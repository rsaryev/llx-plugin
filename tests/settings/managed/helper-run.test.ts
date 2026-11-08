/**
 * settings-reference.md § Write the helper output and § Helper failures (under `policyHelper`);
 * managed-settings.md § Compute the policy with a helper program and § Find entries Claude Code
 * dropped (the stricter reading of a helper's `managedSettings`).
 */
import { describe, expect, test } from 'bun:test';
import {
  HELPER_OUTPUT_CAP_BYTES,
  composeManaged,
  withHelperSettings,
} from '../../../src/settings/managed/index.ts';
import { compose, document } from '../../support/managed.ts';
import { PATH, envelope, failed, helper, run } from '../../support/managed-helper.ts';
import { spec } from '../../support/spec.ts';

spec('policy.reference.Write the helper output', () => {
  test('the helper runs with no arguments and CLAUDE_CODE_VERSION in its environment', async () => {
    const { runner } = await run();
    const [call] = runner.calls;
    expect(call?.spec).toEqual({ form: 'exec', command: PATH, args: [] });
    expect(call?.env.CLAUDE_CODE_VERSION).toBe('2.1.319');
  });

  test('settings under a managedSettings key are the helper output', async () => {
    const { result } = await run({
      reply: envelope({ permissions: { deny: ['Read(//etc/secrets/**)'] } }),
    });
    expect(result).toMatchObject({
      ok: true,
      settings: { permissions: { deny: ['Read(//etc/secrets/**)'] } },
    });
  });

  test('a bare settings object with no managedSettings key applies nothing and reports no error', async () => {
    const { result } = await run({
      reply: { stdout: JSON.stringify({ permissions: { deny: ['Read(./x)'] } }) },
    });
    expect(result).toMatchObject({ ok: true, settings: undefined });
  });

  test('stdout is read up to 1 MiB; more than that to stdout or stderr fails the run', async () => {
    expect(HELPER_OUTPUT_CAP_BYTES).toBe(1_048_576);
    const big = 'x'.repeat(HELPER_OUTPUT_CAP_BYTES + 1);
    expect(
      failed(
        (await run({ reply: { stdout: JSON.stringify({ managedSettings: {}, pad: big }) } }))
          .result,
      ),
    ).toBeDefined();
    expect(failed((await run({ reply: { stdout: '{}', stderr: big } })).result)).toBeDefined();
    const fits = JSON.stringify({
      managedSettings: {},
      pad: 'x'.repeat(HELPER_OUTPUT_CAP_BYTES - 100),
    });
    expect((await run({ reply: { stdout: fits } })).result.ok).toBe(true);
  });

  describe('when the helper emits managedSettings', () => {
    const composed = compose({
      plist: {
        policyHelper: helper,
        sandbox: { network: { allowManagedDomainsOnly: true, allowedDomains: ['mdm.example'] } },
      },
      file: { model: 'file', allowAllClaudeAiMcps: true },
      hkcu: { cleanupPeriodDays: 3 },
    });
    const emitted = { model: 'helper' } as const;
    const helped = withHelperSettings(composed, emitted);

    test('that object becomes the only managed settings source for the run', () => {
      expect(helped.layer.settings).toEqual({ model: 'helper' });
    });

    test('the MDM, file and HKCU sources are ignored and /status names the helper', () => {
      expect(helped.settingSources).toBe('Enterprise managed settings (helper)');
      expect(helped.used).toEqual([]);
      expect(helped.layer.settings.allowAllClaudeAiMcps).toBeUndefined();
      expect(helped.layer.settings.cleanupPeriodDays).toBeUndefined();
    });

    test('the cross-source keys are read from the helper output alone', () => {
      expect(composed.layer.settings.sandbox?.network?.allowManagedDomainsOnly).toBe(true);
      expect(helped.layer.settings.sandbox).toBeUndefined();
      const locked = withHelperSettings(composed, {
        sandbox: { network: { allowManagedDomainsOnly: true, allowedDomains: ['helper.example'] } },
      });
      expect(locked.layer.settings.sandbox?.network?.allowedDomains).toEqual(['helper.example']);
    });

    test('no cross-source key of an admin source reaches the helper layer', () => {
      const crowded = compose({
        remote: { model: 'remote', allowManagedMcpServersOnly: true, maxEffortLevel: 'low' },
        plist: {
          policyHelper: helper,
          deniedMcpServers: [{ serverName: 'x' }],
          syncClaudeAiSkills: false,
          enableArtifact: false,
          disableClaudeAiConnectors: true,
          env: { A: '1' },
          attribution: false,
          sandbox: { bwrapPath: '/usr/bin/bwrap', network: { strictAllowlist: true } },
        },
        file: { allowedMcpServers: [{ serverName: 'file' }], allowAllClaudeAiMcps: true },
      });
      expect(withHelperSettings(crowded, emitted).layer.settings).toEqual({ model: 'helper' });
    });

    test('parent settings are never merged', () => {
      const parentMerging = compose({
        file: { policyHelper: helper, parentSettingsBehavior: 'merge' },
      });
      expect(parentMerging.parentMerge).toBe(true);
      expect(withHelperSettings(parentMerging, emitted).parentMerge).toBe(false);
    });

    test('the startup forceRemoteSettingsRefresh check still reads the admin sources', () => {
      const forced = compose({ file: { policyHelper: helper, forceRemoteSettingsRefresh: true } });
      expect(withHelperSettings(forced, emitted).forceRemoteRefresh).toBe(true);
    });
  });

  test('a helper that exits 0 with an envelope omitting managedSettings contributes nothing, and the other sources apply as usual', async () => {
    const { result } = await run({ reply: { stdout: '{}' } });
    expect(result).toMatchObject({ ok: true, settings: undefined });
    const composed = compose({ file: { model: 'file', policyHelper: helper } });
    expect(composed.layer.settings.model).toBe('file');
    expect(composed.used).toEqual(['file']);
  });
});

spec('policy.managed.Compute the policy with a helper program', () => {
  test('the emitted managedSettings object is the only managed settings for the session, cross-source keys included', () => {
    const composed = compose({
      remote: { model: 'remote' },
      file: { policyHelper: helper, allowAllClaudeAiMcps: true, env: { A: '1' } },
    });
    const helped = withHelperSettings(composed, { model: 'helper' });
    expect(helped.layer.settings).toEqual({ model: 'helper' });
    expect(helped.layer.settings.env).toBeUndefined();
  });

  test('a policyHelper is named by the MDM policy or the managed settings file and runs at startup', () => {
    expect(compose({ plist: { policyHelper: helper } }).helper.runsAtLaunch).toBe(true);
    expect(compose({ file: { policyHelper: helper } }).helper.runsAtLaunch).toBe(true);
  });

  test('forceRemoteSettingsRefresh has its own startup rule and is not taken from the helper output', () => {
    const composed = compose({ file: { policyHelper: helper } });
    const helped = withHelperSettings(composed, {
      model: 'helper',
      forceRemoteSettingsRefresh: true,
    });
    expect(helped.forceRemoteRefresh).toBe(false);
    expect(helped.layer.settings).toEqual({ model: 'helper' });
    expect(helped.admins).toEqual([{ model: 'helper' }]);
  });

  test('the startup check still reads the admin sources, whatever the helper emits', () => {
    const forced = compose({ file: { policyHelper: helper, forceRemoteSettingsRefresh: true } });
    const helped = withHelperSettings(forced, { forceRemoteSettingsRefresh: false });
    expect(helped.forceRemoteRefresh).toBe(true);
    expect(helped.layer.settings.forceRemoteSettingsRefresh).toBeUndefined();
  });

  test('the composition stays pure: the sources that applied are re-composable without the helper', () => {
    const documents = [document('file', { policyHelper: helper, model: 'file' })];
    const before = composeManaged(documents);
    const helped = withHelperSettings(before, { model: 'helper' });
    expect(helped).not.toBe(before);
    expect(helped.layer.settings.model).toBe('helper');
    expect(before.layer.settings.model).toBe('file');
    expect(composeManaged(documents)).toEqual(before);
  });
});

spec('policy.managed.Find entries Claude Code dropped', () => {
  describe('the managedSettings a policyHelper emits', () => {
    test('the same entry repairs as a file, but a surviving violation fails the whole run like a non-zero exit', async () => {
      const repaired = await run({
        reply: envelope({ model: 'a', permissions: { allow: ['Bash(ls)', 7] } }),
      });
      expect(repaired.result).toMatchObject({
        ok: true,
        settings: { model: 'a', permissions: { allow: ['Bash(ls)'] } },
      });
      const failing = await run({ reply: envelope({ model: 'a', env: 5 }), phase: 'startup' });
      expect(failed(failing.result)?.outcome.stopsClaudeCode).toBe(true);
    });
  });
});
