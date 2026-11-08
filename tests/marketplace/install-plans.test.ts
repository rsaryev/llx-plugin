/**
 * plugins/install.md § Manage installed plugins (the details menu offers Disable or Enable, Update
 * now and Uninstall, Configure options for a `userConfig`, Configure for a bundled MCP server; a
 * Managed plugin cannot be enabled, disabled or uninstalled in the panel; closing the panel with
 * pending changes runs `/reload-plugins`, or warns and leaves them pending when the reload would
 * invalidate the prompt cache), § Uninstall a plugin the project enables (Disable for me: `y`; Uninstall
 * for everyone: `u`), § Manage marketplaces (list, update and remove, from a shell or a session; a
 * removal uninstalls every plugin installed from the marketplace and drops its `enabledPlugins`
 * entries), § Update plugins now (the Marketplaces tab refreshes a listing and updates the installed
 * plugins, leaving a `command` source or a `headersHelper` entry for you; `claude plugin marketplace
 * update` with no name refreshes every listing and leaves installed plugins at their versions);
 * plugins/cli-reference.md § plugin marketplace update.
 */
import { describe, expect, test } from 'bun:test';
import {
  closePanel,
  marketplaceCommand,
  marketplaceTabUpdate,
  pluginActions,
  planMarketplaceRemoval,
  planMarketplaceUpdate,
  uninstallChoice,
} from '../../src/marketplace/install-plans.ts';
import { spec } from '../support/spec.ts';

spec('install.guide.Manage installed plugins', () => {
  test('an enabled plugin offers Disable plugin, Update now and Uninstall', () => {
    expect(
      pluginActions({
        enabled: true,
        scopes: ['user'],
        userConfig: false,
        bundledMcpServer: false,
      }),
    ).toEqual(['Disable plugin', 'Update now', 'Uninstall']);
  });

  test('a disabled plugin offers Enable plugin instead', () => {
    expect(
      pluginActions({
        enabled: false,
        scopes: ['user'],
        userConfig: false,
        bundledMcpServer: false,
      })[0],
    ).toBe('Enable plugin');
  });

  test('Configure options for a userConfig, Configure for a bundled MCP server, and a plugin can show both', () => {
    const both = pluginActions({
      enabled: true,
      scopes: ['user'],
      userConfig: true,
      bundledMcpServer: true,
    });
    expect(both).toEqual([
      'Disable plugin',
      'Update now',
      'Uninstall',
      'Configure options',
      'Configure',
    ]);
    expect(
      pluginActions({
        enabled: true,
        scopes: ['user'],
        userConfig: true,
        bundledMcpServer: false,
      }).slice(3),
    ).toEqual(['Configure options']);
    expect(
      pluginActions({
        enabled: true,
        scopes: ['user'],
        userConfig: false,
        bundledMcpServer: true,
      }).slice(3),
    ).toEqual(['Configure']);
  });

  test('a plugin at Managed scope cannot be enabled, disabled or uninstalled in the panel', () => {
    expect(
      pluginActions({
        enabled: true,
        scopes: ['managed'],
        userConfig: false,
        bundledMcpServer: false,
      }),
    ).toEqual(['Update now']);
  });

  test('a plugin also installed at a writable scope keeps its actions', () => {
    expect(
      pluginActions({
        enabled: true,
        scopes: ['managed', 'user'],
        userConfig: false,
        bundledMcpServer: false,
      }),
    ).toContain('Uninstall');
  });

  test('closing the panel with pending changes runs /reload-plugins', () => {
    expect(closePanel({ pending: true, invalidatesPromptCache: false })).toEqual({ reload: 'run' });
  });

  test('when the reload would invalidate the prompt cache it warns and leaves the changes pending, for --force', () => {
    expect(closePanel({ pending: true, invalidatesPromptCache: true })).toEqual({
      reload: 'warn-and-leave-pending',
      forceCommand: '/reload-plugins --force',
    });
  });

  test('with no pending change nothing runs', () => {
    expect(closePanel({ pending: false, invalidatesPromptCache: true })).toEqual({
      reload: 'none',
    });
  });
});

spec('install.guide.Uninstall a plugin the project enables', () => {
  test('asks whether to disable it for you or uninstall it for everyone', () => {
    expect(uninstallChoice({ enabledByProject: true })).toEqual([
      {
        key: 'y',
        label: 'Disable for me',
        writes: { file: '.claude/settings.local.json', value: false },
        installed: true,
      },
      {
        key: 'u',
        label: 'Uninstall for everyone',
        removesFrom: '.claude/settings.json',
        installed: false,
      },
    ]);
  });

  test('a plugin the project does not enable is uninstalled without the question', () => {
    expect(uninstallChoice({ enabledByProject: false })).toBeUndefined();
  });
});

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
    expect(planMarketplaceUpdate('acme', ['acme', 'other'])).toEqual({
      refresh: ['acme'],
      updatesInstalledPlugins: false,
      success: 'Successfully updated marketplace: acme',
    });
    expect(planMarketplaceUpdate(undefined, ['acme', 'other'])).toEqual({
      refresh: ['acme', 'other'],
      updatesInstalledPlugins: false,
      success: 'Successfully updated 2 marketplaces',
    });
  });

  test('an unregistered name refreshes nothing and says it is not found', () => {
    expect(planMarketplaceUpdate('nope', ['acme'])).toEqual({
      refresh: [],
      updatesInstalledPlugins: false,
      failure: "Marketplace 'nope' not found",
    });
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
  test('a name is required for update and remove only where one is given', () => {
    expect(marketplaceCommand('update', 'shell')).toBe('claude plugin marketplace update');
  });
});
