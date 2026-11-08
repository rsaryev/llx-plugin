/**
 * managed-settings.md § Where and when a policy applies, § What a developer can change (the model and
 * the auto-compact window for a session); settings-reference.md, `forceRemoteSettingsRefresh`
 * (startup) and `autoCompactWindow` (per-session overrides).
 */
import { describe, expect, test } from 'bun:test';
import {
  claudeAiAppliesMarketplaceLists,
  helperRunsNow,
  minimumVersionEffect,
  reachOfPlace,
  reachesRunningSession,
  serverChangeTiming,
  sourcesLoadedBy,
  startupFetchOf,
  type Place,
  type PlaceFacts,
} from '../../../src/settings/managed/index.ts';
import { compose } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const WHERE = 'policy.managed.Where and when a policy applies';

const facts = (serverDeliversPolicyKey: boolean, merging = false): PlaceFacts => ({
  serverDeliversPolicyKey,
  merging,
});

spec(`${WHERE}.Surfaces`, () => {
  test('the terminal, the VS Code and JetBrains extensions, the desktop Code tab and Agent SDK sessions all read managed settings', () => {
    for (const surface of [
      'terminal',
      'vscode',
      'jetbrains',
      'desktopCodeTab',
      'agentSdk',
    ] as const) {
      expect(sourcesLoadedBy(surface).managed).toBe(true);
    }
  });

  test('an Agent SDK session loads managed settings even when settingSources leaves out the user, project and local files', () => {
    expect(sourcesLoadedBy('agentSdk', [])).toEqual({ managed: true, files: [] });
    expect(sourcesLoadedBy('agentSdk', ['user'])).toEqual({ managed: true, files: ['user'] });
  });

  test('the other surfaces load every settings file', () => {
    expect(sourcesLoadedBy('terminal').files).toEqual(['user', 'project', 'local']);
  });
});

spec(`${WHERE}.Cloud sessions`, () => {
  test('a session in an Anthropic-hosted environment reads neither the MDM profile nor the file, only server-managed settings', () => {
    expect(reachOfPlace('cloudHosted', facts(true))).toEqual({
      remote: true,
      mdm: false,
      file: 'none',
    });
  });

  test('a self-hosted environment also reads the file of its runner image, by default only when server-managed settings deliver no policy key', () => {
    expect(reachOfPlace('cloudSelfHosted', facts(false)).file).toBe('all');
    expect(reachOfPlace('cloudSelfHosted', facts(true)).file).toBe('crossSourceKeys');
  });

  test('the merge opt-in applies both', () => {
    expect(reachOfPlace('cloudSelfHosted', facts(true, true)).file).toBe('all');
  });
});

spec(`${WHERE}.Claude Tag sessions`, () => {
  test('they receive no server-managed settings', () => {
    expect(reachOfPlace('tagHosted', facts(true))).toEqual({
      remote: false,
      mdm: false,
      file: 'none',
    });
    expect(reachOfPlace('tagSelfHosted', facts(true)).remote).toBe(false);
  });

  test('in a self-hosted environment they still read the managed file of the runner image', () => {
    expect(reachOfPlace('tagSelfHosted', facts(true))).toEqual({
      remote: false,
      mdm: false,
      file: 'all',
    });
  });
});

spec(`${WHERE}.Cowork sessions`, () => {
  test('Cowork never fetches server-managed settings, wherever it runs', () => {
    for (const place of ['coworkOnMachine', 'coworkFullVm', 'coworkRemote'] as const) {
      expect(reachOfPlace(place, facts(true)).remote).toBe(false);
    }
  });

  test('on the user machine it reads the MDM policy and the managed file of that device', () => {
    expect(reachOfPlace('coworkOnMachine', facts(true))).toEqual({
      remote: false,
      mdm: true,
      file: 'all',
    });
  });

  test('in a full VM sandbox and in remote sessions no device policy is present', () => {
    expect(reachOfPlace('coworkFullVm', facts(false))).toEqual({
      remote: false,
      mdm: false,
      file: 'none',
    });
    expect(reachOfPlace('coworkRemote', facts(false))).toEqual({
      remote: false,
      mdm: false,
      file: 'none',
    });
  });

  test('wherever it runs claude.ai applies the console strictKnownMarketplaces and blockedMarketplaces itself', () => {
    const places: Place[] = ['coworkOnMachine', 'coworkFullVm', 'coworkRemote'];
    expect(places.map(claudeAiAppliesMarketplaceLists)).toEqual([true, true, true]);
    expect(claudeAiAppliesMarketplaceLists('machine')).toBe(false);
  });

  test('a developer machine reads every source', () => {
    expect(reachOfPlace('machine', facts(true))).toEqual({ remote: true, mdm: true, file: 'all' });
  });
});

spec(`${WHERE}.Running sessions`, () => {
  test('most changes reach a running session on the delivery schedule without a restart', () => {
    expect(reachesRunningSession('file', 'permissions')).toBe('now');
    expect(reachesRunningSession('mdm', 'permissions')).toBe('on-schedule');
    expect(reachesRunningSession('serverManaged', 'permissions')).toBe('on-schedule');
  });

  test('forceRemoteSettingsRefresh, requiredMinimumVersion and the user-editable keys take effect at the next session start', () => {
    for (const key of [
      'forceRemoteSettingsRefresh',
      'requiredMinimumVersion',
      'model',
      'effortLevel',
    ]) {
      expect(reachesRunningSession('serverManaged', key)).toBe('next-session');
    }
  });

  test('a new or changed policyHelper takes effect at the next launch', () => {
    expect(reachesRunningSession('file', 'policyHelper')).toBe('next-session');
  });

  test('if server-managed settings shadow the helper at launch it runs as soon as a fetch reports them removed', () => {
    const plan = compose({
      remote: { model: 'a' },
      file: { policyHelper: { path: '/bin/h' } },
    }).helper;
    expect(helperRunsNow(plan, { remoteStillDelivers: true })).toBe(false);
    expect(helperRunsNow(plan, { remoteStillDelivers: false })).toBe(true);
  });
});

spec(`${WHERE}.Changes that need approval`, () => {
  test('a server-managed change to a setting that needs approval waits for the dialog in an interactive session', () => {
    expect(
      serverChangeTiming({ needsApproval: true, waitsForNextLaunch: false, hosted: false }),
    ).toBe('awaits-approval');
  });

  test('it applies for the current run in a session an IDE extension or the Agent SDK hosts', () => {
    expect(
      serverChangeTiming({ needsApproval: true, waitsForNextLaunch: false, hosted: true }),
    ).toBe('applies-for-current-run');
  });

  test('other server-managed changes apply on the next poll', () => {
    expect(
      serverChangeTiming({ needsApproval: false, waitsForNextLaunch: false, hosted: false }),
    ).toBe('next-poll');
    expect(
      serverChangeTiming({ needsApproval: false, waitsForNextLaunch: false, hosted: true }),
    ).toBe('next-poll');
  });

  test('the updates that wait for the next launch come first', () => {
    expect(
      serverChangeTiming({ needsApproval: true, waitsForNextLaunch: true, hosted: true }),
    ).toBe('next-launch');
  });
});

spec(`${WHERE}.Long-lived sessions`, () => {
  test('requiredMinimumVersion blocks an outdated binary from starting and does not end a running session', () => {
    expect(minimumVersionEffect({ outdated: true, running: false })).toEqual({
      blocksStart: true,
      endsSession: false,
    });
    expect(minimumVersionEffect({ outdated: true, running: true })).toEqual({
      blocksStart: false,
      endsSession: false,
    });
    expect(minimumVersionEffect({ outdated: false, running: false }).blocksStart).toBe(false);
  });
});

describe('the startup fetch of server-managed settings', () => {
  const base = {
    forceRemoteSettingsRefresh: false,
    fetchesRemote: true,
    signsInAtStartup: false,
    anthropicRequires: false,
    gatewaySession: false,
    authSubcommand: false,
  };

  spec('policy.key.forceRemoteSettingsRefresh', () => {
    test('true blocks startup until a fresh fetch and exits when the fetch fails', () => {
      expect(startupFetchOf({ ...base, forceRemoteSettingsRefresh: true })).toEqual({
        blocksStartup: true,
        exitsOnFailure: true,
      });
    });

    test('unset does not block, though a sign-in startup waits up to five seconds', () => {
      expect(startupFetchOf(base)).toEqual({ blocksStartup: false, exitsOnFailure: false });
      expect(startupFetchOf({ ...base, signsInAtStartup: true }).waitsUpToSeconds).toBe(5);
    });

    test('Anthropic can require the settings, and a Cloud gateway session waits and exits when the gateway cannot be reached', () => {
      expect(startupFetchOf({ ...base, anthropicRequires: true }).blocksStartup).toBe(true);
      expect(startupFetchOf({ ...base, gatewaySession: true })).toEqual({
        blocksStartup: true,
        exitsOnFailure: true,
      });
    });

    test('a session that does not fetch server-managed settings starts without waiting', () => {
      expect(
        startupFetchOf({ ...base, forceRemoteSettingsRefresh: true, fetchesRemote: false })
          .blocksStartup,
      ).toBe(false);
    });

    test('the claude auth subcommands are exempt', () => {
      expect(
        startupFetchOf({ ...base, forceRemoteSettingsRefresh: true, authSubcommand: true })
          .blocksStartup,
      ).toBe(false);
    });
  });
});
