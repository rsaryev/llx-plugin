/**
 * plugins/install.md § Manage marketplaces (list, update and remove, from a shell or a session; a
 * removal uninstalls every plugin installed from the marketplace and drops its `enabledPlugins`
 * entries), § Update plugins now (the Marketplaces tab refreshes a listing and updates the installed
 * plugins, leaving a `command` source or a `headersHelper` entry for you; `claude plugin marketplace
 * update` with no name refreshes every listing and leaves installed plugins at their versions);
 * plugins/cli-reference.md § plugin marketplace update (`Successfully updated marketplace: <name>`
 * from a shell), § plugin marketplace remove (`<name>` required), § Commands in a session;
 * plugins/troubleshooting.md § Install a plugin (`✔ Updated 1 marketplace` in a session).
 */
import { describe, expect, test } from 'bun:test';
import {
  marketplaceCommand,
  marketplaceTabUpdate,
  planMarketplaceRemoval,
  planMarketplaceUpdate,
} from '../../src/marketplace/install-plans.ts';
import { spec } from '../support/spec.ts';

const MANAGE = 'install.guide.Manage marketplaces';

spec(`${MANAGE}.List marketplaces`, () => {
  test('claude plugin marketplace list in a shell, /plugin marketplace list in a session', () => {
    expect(marketplaceCommand('list', 'shell')).toBe('claude plugin marketplace list');
    expect(marketplaceCommand('list', 'session')).toBe('/plugin marketplace list');
  });
});

spec(`${MANAGE}.Update a marketplace's listing`, () => {
  test('the command takes the marketplace name, in a shell and in a session', () => {
    expect(marketplaceCommand('update', 'shell', 'acme')).toBe(
      'claude plugin marketplace update acme',
    );
    expect(marketplaceCommand('update', 'session', 'acme')).toBe('/plugin marketplace update acme');
  });

  test('a named update refreshes that listing; no name refreshes every listing and leaves installed plugins at their versions', () => {
    expect(planMarketplaceUpdate('acme', ['acme', 'other'], 'shell')).toEqual({
      refresh: ['acme'],
      updatesInstalledPlugins: false,
      success: 'Successfully updated marketplace: acme',
    });
    expect(planMarketplaceUpdate(undefined, ['acme', 'other'], 'shell')).toEqual({
      refresh: ['acme', 'other'],
      updatesInstalledPlugins: false,
      success: 'Successfully updated 2 marketplaces',
    });
  });

  test('a session prints `✔ Updated 1 marketplace` for a named update', () => {
    expect(planMarketplaceUpdate('acme', ['acme', 'other'], 'session')).toEqual({
      refresh: ['acme'],
      updatesInstalledPlugins: false,
      success: '✔ Updated 1 marketplace',
    });
  });

  test('a judgment: a session counts every listing it refreshed, in the plural but for one', () => {
    expect(planMarketplaceUpdate(undefined, ['a', 'b', 'c'], 'session').success).toBe(
      '✔ Updated 3 marketplaces',
    );
    expect(planMarketplaceUpdate(undefined, ['a'], 'session').success).toBe(
      '✔ Updated 1 marketplace',
    );
  });

  test('a judgment: an empty registry refreshes nothing and is a count of 0, in a shell and in a session', () => {
    expect(planMarketplaceUpdate(undefined, [], 'shell')).toEqual({
      refresh: [],
      updatesInstalledPlugins: false,
      success: 'Successfully updated 0 marketplaces',
    });
    expect(planMarketplaceUpdate(undefined, [], 'session').success).toBe(
      '✔ Updated 0 marketplaces',
    );
  });

  test('an unregistered name refreshes nothing and says it is not found, on either surface', () => {
    for (const surface of ['shell', 'session'] as const) {
      expect(planMarketplaceUpdate('nope', ['acme'], surface)).toEqual({
        refresh: [],
        updatesInstalledPlugins: false,
        failure: "Marketplace 'nope' not found",
      });
    }
  });

  test('the Marketplaces tab refreshes the listing, updates installed plugins and leaves command and headersHelper ones for you', () => {
    expect(
      marketplaceTabUpdate([
        { id: 'a@acme', commandSource: false, headersHelper: false },
        { id: 'b@acme', commandSource: true, headersHelper: false },
        { id: 'c@acme', commandSource: false, headersHelper: true },
      ]),
    ).toEqual({ update: ['a@acme'], leftForYou: ['b@acme', 'c@acme'] });
  });
});

spec(`${MANAGE}.Remove a marketplace`, () => {
  test('the command names the marketplace, in a shell and in a session', () => {
    expect(marketplaceCommand('remove', 'shell', 'acme')).toBe(
      'claude plugin marketplace remove acme',
    );
    expect(marketplaceCommand('remove', 'session', 'acme')).toBe('/plugin marketplace remove acme');
  });

  test('uninstalls every plugin installed from it and drops their enabledPlugins entries from your settings files', () => {
    const plan = planMarketplaceRemoval({
      marketplace: 'acme',
      installed: [
        { id: 'a@acme', scopes: ['user', 'project'] },
        { id: 'b@other', scopes: ['user'] },
        { id: 'c@acme', scopes: ['local'] },
      ],
      enabledEntries: [
        { id: 'a@acme', scope: 'user' },
        { id: 'a@acme', scope: 'project' },
        { id: 'b@other', scope: 'user' },
        { id: 'c@acme', scope: 'local' },
      ],
    });
    expect(plan.uninstall).toEqual([
      { id: 'a@acme', scopes: ['user', 'project'] },
      { id: 'c@acme', scopes: ['local'] },
    ]);
    expect(plan.dropEnabledEntries).toEqual([
      { id: 'a@acme', scope: 'user' },
      { id: 'a@acme', scope: 'project' },
      { id: 'c@acme', scope: 'local' },
    ]);
  });

  test('the Marketplaces tab names those plugins before it asks to confirm', () => {
    const plan = planMarketplaceRemoval({
      marketplace: 'acme',
      installed: [
        { id: 'a@acme', scopes: ['user'] },
        { id: 'b@other', scopes: ['user'] },
      ],
      enabledEntries: [],
    });
    expect(plan.confirmNames).toEqual(['a@acme']);
  });

  test('a marketplace with nothing installed from it removes only the marketplace', () => {
    const plan = planMarketplaceRemoval({ marketplace: 'acme', installed: [], enabledEntries: [] });
    expect(plan).toEqual({ uninstall: [], dropEnabledEntries: [], confirmNames: [] });
  });
});

describe('the commands', () => {
  test('update takes a name or none; in a session remove with no name opens the Marketplaces tab', () => {
    expect(marketplaceCommand('update', 'shell')).toBe('claude plugin marketplace update');
    expect(marketplaceCommand('remove', 'session')).toBe('/plugin marketplace remove');
  });

  test('a shell remove cannot be built without a name', () => {
    // @ts-expect-error `claude plugin marketplace remove <name>` requires the name.
    const nameless: string = marketplaceCommand('remove', 'shell');
    expect(nameless).toBe('claude plugin marketplace remove');
  });
});
