/**
 * plugins/loading.md § When Claude Code refreshes a marketplace before an install: `name@marketplace`
 * refreshes the named marketplace before the lookup (`/plugin install` and `claude plugin install`),
 * `name` alone refreshes through `/plugin install` only the marketplaces with auto-update on and
 * only after the lookup misses, and through `claude plugin install` nothing; the refresh does not
 * depend on `autoUpdate` or `DISABLE_AUTOUPDATER`; a failed refresh installs from the cached catalog
 * and `claude plugin install` reports `marketplace not refreshed`; five conditions skip it, and a
 * managed block also refuses the install. What the docs leave open (the 30-second boundary, the
 * skip rules for a bare name, the `/plugin` report of a failure) is outside `spec(...)` and in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  refreshBeforeInstall,
  refreshFailed,
  type InstallCommand,
  type KnownMarketplace,
  type RefreshDecision,
  type RefreshRequest,
} from '../../src/updates/refresh-before-install.ts';
import { fakeEnvironment, fixedClock } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const NOW = 1_000_000;

const marketplace = (name: string, extra: Partial<KnownMarketplace> = {}): KnownMarketplace => ({
  name,
  source: 'github',
  autoUpdate: false,
  seeded: false,
  ...extra,
});

interface Setup {
  readonly ref: string;
  readonly command?: InstallCommand;
  readonly known?: readonly KnownMarketplace[];
  readonly lookupMissed?: boolean;
  readonly env?: Record<string, string>;
}

const decide = (setup: Setup): RefreshDecision => {
  const request: RefreshRequest = {
    ref: setup.ref,
    command: setup.command ?? '/plugin install',
    marketplaces: setup.known ?? [marketplace('acme')],
    lookupMissed: setup.lookupMissed ?? false,
    env: fakeEnvironment(setup.env),
    clock: fixedClock(NOW),
  };
  return refreshBeforeInstall(request);
};

const refreshed = (...names: string[]): RefreshDecision => ({
  outcome: 'refresh',
  marketplaces: names,
});

const COMMANDS: readonly InstallCommand[] = ['/plugin install', 'claude plugin install'];

spec('updates.loading.When Claude Code refreshes a marketplace before an install', () => {
  test('the table has three rows and the lookup decides the bare name only for /plugin', () => {
    expect(decide({ ref: 'fmt@acme' })).toEqual(refreshed('acme'));
    expect(
      decide({
        ref: 'fmt',
        known: [marketplace('acme', { autoUpdate: true })],
        lookupMissed: true,
      }),
    ).toEqual(refreshed('acme'));
    expect(
      decide({
        ref: 'fmt',
        command: 'claude plugin install',
        known: [marketplace('acme', { autoUpdate: true })],
        lookupMissed: true,
      }),
    ).toEqual({ outcome: 'skip', reason: 'cli-reads-cached-catalogs' });
  });

  test('a failed refresh installs from the cached catalog; the CLI reports "marketplace not refreshed"', () => {
    expect(refreshFailed('claude plugin install')).toEqual({
      installFrom: 'cached catalog',
      report: { severity: 'warning', path: 'marketplace', message: 'marketplace not refreshed' },
    });
  });

  test('a /plugin install proceeds from the cache too and the docs name no report for it', () => {
    expect(refreshFailed('/plugin install')).toEqual({ installFrom: 'cached catalog' });
  });

  test('a marketplace added from a local file or directory is not refreshed', () => {
    for (const source of ['file', 'directory'] as const) {
      expect(decide({ ref: 'fmt@acme', known: [marketplace('acme', { source })] })).toEqual({
        outcome: 'skip',
        reason: 'local-or-inline-source',
      });
    }
  });

  test('a marketplace defined inline in settings is not refreshed', () => {
    expect(
      decide({ ref: 'fmt@acme', known: [marketplace('acme', { source: 'settings' })] }),
    ).toEqual({ outcome: 'skip', reason: 'local-or-inline-source' });
  });

  test('a marketplace a seed directory supplies is not refreshed', () => {
    expect(decide({ ref: 'fmt@acme', known: [marketplace('acme', { seeded: true })] })).toEqual({
      outcome: 'skip',
      reason: 'seed-directory',
    });
  });

  test('a marketplace refreshed within the last 30 seconds is not refreshed again', () => {
    const within = marketplace('acme', { lastRefreshedAt: NOW - 29_999 });
    expect(decide({ ref: 'fmt@acme', known: [within] })).toEqual({
      outcome: 'skip',
      reason: 'refreshed-within-30-seconds',
    });
    const earlier = marketplace('acme', { lastRefreshedAt: NOW - 31_000 });
    expect(decide({ ref: 'fmt@acme', known: [earlier] })).toEqual(refreshed('acme'));
  });

  test('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC skips the refresh', () => {
    for (const command of COMMANDS) {
      expect(
        decide({
          ref: 'fmt@acme',
          command,
          env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        }),
      ).toEqual({ outcome: 'skip', reason: 'nonessential-traffic-disabled' });
    }
  });

  test('a marketplace managed settings block is not refreshed and the install is refused', () => {
    const message = "Marketplace 'acme' is blocked by enterprise policy";
    const blocked = marketplace('acme', { blocked: message });
    for (const command of COMMANDS) {
      expect(decide({ ref: 'fmt@acme', command, known: [blocked] })).toEqual({
        outcome: 'refuse',
        reason: 'blocked-by-managed-settings',
        issue: { severity: 'error', path: 'marketplace', message },
      });
    }
  });
});

spec(
  'updates.loading.When Claude Code refreshes a marketplace before an install.name@marketplace',
  () => {
    test('both commands refresh the named marketplace, whatever its auto-update setting', () => {
      for (const command of COMMANDS) {
        const off = marketplace('acme', { autoUpdate: false });
        expect(decide({ ref: 'fmt@acme', command, known: [off, marketplace('other')] })).toEqual(
          refreshed('acme'),
        );
      }
    });

    test('DISABLE_AUTOUPDATER and DISABLE_UPDATES do not stop it', () => {
      expect(
        decide({
          ref: 'fmt@acme',
          env: { DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '1' },
          known: [marketplace('acme', { autoUpdate: false })],
        }),
      ).toEqual(refreshed('acme'));
    });

    test('only the named marketplace is refreshed, even with the lookup missed', () => {
      const known = [marketplace('acme'), marketplace('other', { autoUpdate: true })];
      expect(decide({ ref: 'fmt@acme', known, lookupMissed: true })).toEqual(refreshed('acme'));
    });

    test('a marketplace the user never added has nothing to refresh', () => {
      expect(decide({ ref: 'fmt@nowhere' })).toEqual({
        outcome: 'skip',
        reason: 'marketplace-unknown',
      });
    });
  },
);

spec('updates.loading.When Claude Code refreshes a marketplace before an install.name', () => {
  const onAndOff = [
    marketplace('auto-one', { autoUpdate: true }),
    marketplace('manual'),
    marketplace('auto-two', { autoUpdate: true }),
  ];

  test('/plugin install refreshes only the auto-update marketplaces, after the lookup misses', () => {
    expect(decide({ ref: 'fmt', known: onAndOff, lookupMissed: true })).toEqual(
      refreshed('auto-one', 'auto-two'),
    );
  });

  test('/plugin install refreshes nothing while the lookup finds the plugin', () => {
    expect(decide({ ref: 'fmt', known: onAndOff, lookupMissed: false })).toEqual({
      outcome: 'skip',
      reason: 'lookup-found-the-plugin',
    });
  });

  test('/plugin install with no auto-update marketplace has nothing to refresh after a miss', () => {
    expect(decide({ ref: 'fmt', known: [marketplace('manual')], lookupMissed: true })).toEqual({
      outcome: 'skip',
      reason: 'no-auto-update-marketplace',
    });
  });

  test('claude plugin install refreshes nothing, even after a miss', () => {
    expect(
      decide({
        ref: 'fmt',
        command: 'claude plugin install',
        known: onAndOff,
        lookupMissed: true,
      }),
    ).toEqual({ outcome: 'skip', reason: 'cli-reads-cached-catalogs' });
  });

  test('the refresh of a bare name does not depend on DISABLE_AUTOUPDATER', () => {
    expect(
      decide({
        ref: 'fmt',
        known: onAndOff,
        lookupMissed: true,
        env: { DISABLE_AUTOUPDATER: '1' },
      }),
    ).toEqual(refreshed('auto-one', 'auto-two'));
  });
});

describe('refresh before install, what the docs leave open (spec/judgments.md)', () => {
  test('the skip conditions of the named install apply to each marketplace a bare name would refresh', () => {
    const known = [
      marketplace('seeded', { autoUpdate: true, seeded: true }),
      marketplace('local', { autoUpdate: true, source: 'directory' }),
      marketplace('recent', { autoUpdate: true, lastRefreshedAt: NOW - 1_000 }),
      marketplace('remote', { autoUpdate: true }),
    ];
    expect(decide({ ref: 'fmt', known, lookupMissed: true })).toEqual(refreshed('remote'));
  });

  test('a managed block of a marketplace a bare name would refresh drops it without refusing', () => {
    const known = [
      marketplace('blocked', { autoUpdate: true, blocked: 'blocked by enterprise policy' }),
      marketplace('remote', { autoUpdate: true }),
    ];
    expect(decide({ ref: 'fmt', known, lookupMissed: true })).toEqual(refreshed('remote'));
  });

  test('exactly 30 seconds ago is no longer within the last 30 seconds', () => {
    const known = [marketplace('acme', { lastRefreshedAt: NOW - 30_000 })];
    expect(decide({ ref: 'fmt@acme', known })).toEqual(refreshed('acme'));
  });

  test('an empty value of the traffic variable is not set; any other value is', () => {
    expect(
      decide({ ref: 'fmt@acme', env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '' } }),
    ).toEqual(refreshed('acme'));
    expect(
      decide({ ref: 'fmt@acme', env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 'yes please' } }),
    ).toEqual({ outcome: 'skip', reason: 'nonessential-traffic-disabled' });
  });

  test('a reference with two @ is no reference', () => {
    expect(decide({ ref: 'a@b@c' })).toEqual({ outcome: 'skip', reason: 'invalid-reference' });
  });
});
