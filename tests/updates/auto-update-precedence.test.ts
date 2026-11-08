/**
 * plugins/loading.md § Which marketplaces and plugins auto-update (precedence: a settings entry's
 * `autoUpdate`, then the one in `known_marketplaces.json`, then the default; the environment
 * variables that turn the whole pass and the toggle off; the plugins the pass skips),
 * plugins/install.md § Turn auto-update on or off for a marketplace (the toggle),
 * plugins/host-marketplace.md § Turn on auto-update (no `marketplace.json` field turns it on; a user
 * toggle or a managed `autoUpdate` does), plugins/org.md § Turn auto-update on or off per
 * marketplace (a managed entry that sets the field refuses the toggle) and § Turn updates off for
 * the whole fleet (`DISABLE_AUTOUPDATER` in the managed `env`, `FORCE_AUTOUPDATE_PLUGINS`; command
 * sources are not covered: each enabled one still re-runs every session). What the docs leave open is outside `spec(...)` and in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../src/format/marketplace/index.ts';
import {
  autoUpdatePassAllowed,
  marketplaceAutoUpdate,
  toggleDecision,
  type AutoUpdateFacts,
} from '../../src/updates/auto-update-precedence.ts';
import { planAutoUpdatePass } from '../../src/updates/auto-update-pass.ts';
import { pluginSkippedByAutoUpdate } from '../../src/updates/auto-update-skips.ts';
import { commandSourceRuns, type CommandPlugin } from '../../src/updates/command-source-rerun.ts';
import { planUpdate } from '../../src/updates/update-targets.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const HOSTING =
  "marketplace.hosting.Work around what a marketplace can't do.Turn on auto-update for your users";
const facts = (name: string, rest: Omit<AutoUpdateFacts, 'name'> = {}): AutoUpdateFacts => ({
  name,
  ...rest,
});

const pass = (env: Record<string, string>): boolean => autoUpdatePassAllowed(fakeEnvironment(env));

spec(
  [
    'policy.org.Seed containers and CI.Read-only',
    'updates.loading.Which marketplaces and plugins auto-update',
    'environment.host.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    'environment.host.DISABLE_AUTOUPDATER',
    'environment.host.DISABLE_UPDATES',
    'environment.host.FORCE_AUTOUPDATE_PLUGINS',
  ],
  () => {
    test('the extraKnownMarketplaces entry beats known_marketplaces.json, which beats the default', () => {
      expect(marketplaceAutoUpdate(facts('acme', { settingsEntry: true, recorded: false }))).toBe(
        true,
      );
      expect(
        marketplaceAutoUpdate(
          facts('claude-plugins-official', { settingsEntry: false, recorded: true }),
        ),
      ).toBe(false);
      expect(marketplaceAutoUpdate(facts('acme', { recorded: true }))).toBe(true);
      expect(marketplaceAutoUpdate(facts('claude-plugins-official', { recorded: false }))).toBe(
        false,
      );
      expect(marketplaceAutoUpdate(facts('acme'))).toBe(false);
    });

    test('the default is on for claude-plugins-official and the other official names', () => {
      for (const name of [
        'claude-plugins-official',
        'claude-code-marketplace',
        'anthropic-agent-skills',
        'life-sciences',
        'claude-for-legal',
      ]) {
        expect(marketplaceAutoUpdate(facts(name))).toBe(true);
      }
    });

    test('the default is off for knowledge-work-plugins and first-party-plugins, though they are official', () => {
      expect(marketplaceAutoUpdate(facts('knowledge-work-plugins'))).toBe(false);
      expect(marketplaceAutoUpdate(facts('first-party-plugins'))).toBe(false);
    });

    test('the default is off for community and third-party marketplaces', () => {
      for (const name of ['claude-community', 'healthcare', 'acme-tools']) {
        expect(marketplaceAutoUpdate(facts(name))).toBe(false);
      }
    });

    test('a marketplace added from claude.ai defaults on, and an explicit choice still wins', () => {
      expect(marketplaceAutoUpdate(facts('team-plugins', { fromClaudeAi: true }))).toBe(true);
      expect(
        marketplaceAutoUpdate(facts('team-plugins', { fromClaudeAi: true, recorded: false })),
      ).toBe(false);
    });

    test('DISABLE_UPDATES, DISABLE_AUTOUPDATER and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC turn the whole pass off', () => {
      expect(pass({})).toBe(true);
      for (const name of [
        'DISABLE_UPDATES',
        'DISABLE_AUTOUPDATER',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      ]) {
        expect(pass({ [name]: '1' })).toBe(false);
      }
    });

    test('FORCE_AUTOUPDATE_PLUGINS=1 keeps the pass on under each of them', () => {
      for (const name of [
        'DISABLE_UPDATES',
        'DISABLE_AUTOUPDATER',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      ]) {
        expect(pass({ [name]: '1', FORCE_AUTOUPDATE_PLUGINS: '1' })).toBe(true);
      }
      expect(pass({ DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '0' })).toBe(false);
    });

    test('the Enable auto-update toggle is hidden when the pass is off and shown under FORCE_AUTOUPDATE_PLUGINS', () => {
      const request = { name: 'acme', enable: true };
      const hidden = toggleDecision({ ...request, env: fakeEnvironment({ DISABLE_UPDATES: '1' }) });
      expect(hidden).toEqual({ outcome: 'hidden' });
      const shown = toggleDecision({
        ...request,
        env: fakeEnvironment({ DISABLE_UPDATES: '1', FORCE_AUTOUPDATE_PLUGINS: '1' }),
      });
      expect(shown).toMatchObject({ outcome: 'write' });
    });

    test('auto-update skips a plugin whose marketplace entry declares a headersHelper', () => {
      expect(pluginSkippedByAutoUpdate({ headersHelper: 'get-token.sh' })).toEqual({
        skipped: true,
        reason: 'headers-helper',
        listedInErrorsTab: true,
      });
      expect(pluginSkippedByAutoUpdate({})).toEqual({ skipped: false });
    });
  },
);

spec(['updates.hosting.Turn on auto-update', HOSTING], () => {
  test('marketplace.json has no field that turns it on: an autoUpdate in the catalog changes nothing', () => {
    const { marketplace } = readMarketplace({
      name: 'acme-tools',
      owner: { name: 'Acme' },
      autoUpdate: true,
      plugins: [],
    });
    expect(marketplace).toBeDefined();
    expect(marketplace).not.toHaveProperty('autoUpdate');
  });

  test("the catalog's autoUpdate is reported as an unknown field Claude Code ignores", () => {
    const { issues } = readMarketplace({
      name: 'acme-tools',
      owner: { name: 'Acme' },
      autoUpdate: true,
      plugins: [],
    });
    expect(issues).toContainEqual({
      severity: 'warning',
      path: 'autoUpdate',
      message: "Unknown field 'autoUpdate'. Claude Code ignores it at load time.",
    });
  });

  test('so a marketplace nobody turned on stays off', () => {
    expect(marketplaceAutoUpdate(facts('acme-tools'))).toBe(false);
  });

  test('a user turns it on in the Marketplaces tab; it is on from then on', () => {
    const decision = toggleDecision({
      name: 'acme-tools',
      enable: true,
      env: fakeEnvironment(),
    });
    expect(decision).toMatchObject({ outcome: 'write', autoUpdate: true });
    expect(marketplaceAutoUpdate(facts('acme-tools', { recorded: true }))).toBe(true);
  });

  test('an admin sets autoUpdate true on the managed entry: on for everyone who receives the settings', () => {
    expect(marketplaceAutoUpdate(facts('acme-tools', { settingsEntry: true }))).toBe(true);
    expect(
      marketplaceAutoUpdate(facts('acme-tools', { settingsEntry: true, recorded: false })),
    ).toBe(true);
  });
});

spec('updates.hosting.Turn on auto-update', () => {
  test('without auto-update users receive changes through a marketplace update or claude plugin update', () => {
    const registered = ['acme-tools'];
    expect(marketplaceAutoUpdate(facts('acme-tools'))).toBe(false);
    expect(
      planUpdate({ kind: 'marketplace-listing', marketplace: 'acme-tools' }, [], registered),
    ).toMatchObject({
      refresh: ['acme-tools'],
    });
    expect(
      planUpdate(
        { kind: 'plugin', id: 'formatter@acme-tools' },
        [{ id: 'formatter@acme-tools', marketplace: 'acme-tools' }],
        registered,
      ).update,
    ).toEqual(['formatter@acme-tools']);
  });
});

spec('updates.org.Turn updates off for the whole fleet', () => {
  test('DISABLE_AUTOUPDATER in the managed env block turns plugin auto-update off for every marketplace', () => {
    const managedEnv = fakeEnvironment({ DISABLE_AUTOUPDATER: '1' });
    expect(autoUpdatePassAllowed(managedEnv)).toBe(false);
    // the marketplace's own setting is untouched: it is the whole pass that is off
    expect(marketplaceAutoUpdate(facts('claude-plugins-official'))).toBe(true);
  });

  test('it does not cover plugins with a command source: each enabled one still re-runs every session', () => {
    const managedEnv = fakeEnvironment({ DISABLE_AUTOUPDATER: '1' });
    const command = { command: 'my-tool print-plugin', mode: 'copy' } as const;
    const tool: CommandPlugin = {
      id: 'tool@acme',
      enabled: true,
      installedVersionInCache: true,
      declared: command,
      accepted: command,
    };
    expect(commandSourceRuns('session-start', tool, managedEnv).runs).toEqual(['once-per-session']);
    // the auto-update pass of the same environment does nothing, even for a marketplace that is on
    const marketplace = {
      name: 'acme',
      autoUpdate: true,
      plugins: [{ id: 'formatter@acme', candidate: {} }],
    };
    expect(planAutoUpdatePass([marketplace], managedEnv)).toEqual({
      refresh: [],
      update: [],
      skipped: [],
    });
  });

  test('FORCE_AUTOUPDATE_PLUGINS in the same block keeps plugin auto-update while Claude Code stays put', () => {
    expect(
      autoUpdatePassAllowed(
        fakeEnvironment({ DISABLE_AUTOUPDATER: '1', FORCE_AUTOUPDATE_PLUGINS: '1' }),
      ),
    ).toBe(true);
  });

  test('the other variables that stop plugin auto-update work the same way', () => {
    expect(pass({ DISABLE_UPDATES: '1' })).toBe(false);
    expect(pass({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' })).toBe(false);
    expect(pass({ DISABLE_UPDATES: '1', FORCE_AUTOUPDATE_PLUGINS: '1' })).toBe(true);
  });
});

describe('auto-update precedence, what the docs leave open (spec/judgments.md)', () => {
  test('a seed marketplace is forced off, whatever else says', () => {
    expect(marketplaceAutoUpdate(facts('claude-plugins-official', { seeded: true }))).toBe(false);
    expect(marketplaceAutoUpdate(facts('acme', { seeded: true, settingsEntry: true }))).toBe(false);
  });

  test('a managed declaration in a file the user cannot write gets no settings write, and the same for --settings', () => {
    const env = fakeEnvironment();
    expect(
      toggleDecision({ name: 'acme', enable: true, env, declared: { scope: 'flag' } }),
    ).toMatchObject({ writes: [{ file: 'known_marketplaces.json' }] });
    expect(
      toggleDecision({ name: 'acme', enable: true, env, declared: { scope: 'addDir' } }),
    ).toMatchObject({ writes: [{ file: 'known_marketplaces.json' }] });
  });

  test('a variable counts as on for 1, true, yes and on in any case; 0 and empty are off', () => {
    for (const on of ['1', 'true', 'YES', ' On ']) {
      expect(pass({ DISABLE_AUTOUPDATER: on })).toBe(false);
    }
    for (const off of ['0', '', 'no', 'false']) {
      expect(pass({ DISABLE_AUTOUPDATER: off })).toBe(true);
    }
  });

  test('a command source is skipped by the pass: it re-runs on its own schedule', () => {
    expect(pluginSkippedByAutoUpdate({ commandSource: { accepted: true } })).toEqual({
      skipped: true,
      reason: 'command-source',
      listedInErrorsTab: false,
    });
  });

  test('a command source whose command the user has not accepted is listed in the Errors tab', () => {
    expect(pluginSkippedByAutoUpdate({ commandSource: { accepted: false } })).toEqual({
      skipped: true,
      reason: 'command-needs-acceptance',
      listedInErrorsTab: true,
    });
  });

  test('a headersHelper wins over the command source reasons', () => {
    expect(
      pluginSkippedByAutoUpdate({ commandSource: { accepted: true }, headersHelper: 'h.sh' }),
    ).toMatchObject({ reason: 'headers-helper', listedInErrorsTab: true });
  });
});
