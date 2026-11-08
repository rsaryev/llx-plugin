/**
 * plugins/install.md § Install a plugin, § Install from your shell (Scope, When the plugins load,
 * The marketplace on a new machine), § Add a marketplace and install in one command (Add and install
 * in a session, Add and install from your shell), § JetBrains, non-interactive runs, and the Agent
 * SDK. Plans of what each command opens, adds, asks and prints.
 */
import { expect, test } from 'bun:test';
import {
  installSummary,
  planInstallCommand,
  shellInstallLines,
  shellInstallPrelude,
  type InstallCommandPlan,
} from '../../src/marketplace/install-commands.ts';
import { spec } from '../support/spec.ts';

const plan = (...args: Parameters<typeof planInstallCommand>): InstallCommandPlan => {
  const planned = planInstallCommand(...args);
  if ('severity' in planned) throw new Error(`refused: ${planned.message}`);
  return planned;
};

spec('install.guide.Install a plugin', () => {
  test('/plugin install in a session does not install right away: it opens the plugin details so you review it and choose a scope first', () => {
    expect(plan({ surface: 'session', plugin: 'commit-commands@claude-plugins-official' })).toEqual(
      {
        installs: false,
        opensDetails: true,
        confirmsMarketplace: false,
        addsMarketplace: false,
        marketplaceDeclaredIn: undefined,
        scope: undefined,
      },
    );
  });

  test('the last sentence of the summary says whether the plugin is usable in this session yet', () => {
    const base = {
      invalidatesPromptCache: false,
      activationFailed: false,
      loadFailed: false,
      bundledServerNeedsSetup: false,
    };
    expect(installSummary(base).lines).toEqual(['Plugin is now active.']);
    expect(installSummary({ ...base, bundledServerNeedsSetup: true }).lines).toEqual([
      'Plugin is now active.',
      'Its bundled MCP server needs configuration before it can start',
    ]);
    expect(installSummary({ ...base, activationFailed: true })).toEqual({
      lines: ['Run /reload-plugins to apply.'],
      runsReload: true,
      pending: false,
    });
    expect(installSummary({ ...base, loadFailed: true }).lines).toEqual([
      "The plugin couldn't be loaded",
    ]);
  });

  test('a reload that would invalidate the prompt cache is not run: the plugin stays pending', () => {
    expect(
      installSummary({
        invalidatesPromptCache: true,
        activationFailed: false,
        loadFailed: false,
        bundledServerNeedsSetup: false,
      }),
    ).toEqual({ lines: ['Run /reload-plugins to apply.'], runsReload: false, pending: true });
  });
});

spec('install.guide.Install from your shell.When the plugins load', () => {
  test('the command installs now, at user scope unless told otherwise, and prints the success line', () => {
    expect(
      plan({ surface: 'shell', plugin: 'formatter@your-org', scope: 'project' }),
    ).toMatchObject({
      installs: true,
      opensDetails: false,
      scope: 'project',
    });
    expect(plan({ surface: 'shell', plugin: 'formatter@your-org' }).scope).toBe('user');
    expect(shellInstallLines({ pluginId: 'formatter@your-org', scope: 'project' })).toEqual([
      'Successfully installed plugin: formatter@your-org (scope: project)',
    ]);
  });
});

spec('install.guide.Install from your shell.The marketplace on a new machine', () => {
  const add = 'claude plugin marketplace add anthropics/claude-plugins-official';

  test('where no interactive session has run yet the official marketplace is not registered, so the script adds it first', () => {
    expect(shellInstallPrelude({ marketplace: 'claude-plugins-official', registered: [] })).toEqual(
      [add],
    );
  });

  test('a registered official marketplace, or any other marketplace, needs no prelude', () => {
    expect(
      shellInstallPrelude({
        marketplace: 'claude-plugins-official',
        registered: ['claude-plugins-official'],
      }),
    ).toEqual([]);
    expect(shellInstallPrelude({ marketplace: 'your-org', registered: [] })).toEqual([]);
  });
});

spec('install.guide.Add and install in a session', () => {
  const command = {
    surface: 'session',
    plugin: 'deploy-helper',
    marketplace: 'your-org/plugins',
  } as const;

  test('a marketplace not added yet is shown as resolved and confirmed before it is added; then the plugin details open', () => {
    expect(plan(command)).toMatchObject({
      confirmsMarketplace: true,
      addsMarketplace: true,
      opensDetails: true,
      installs: false,
    });
  });

  test('a source that matches a marketplace already added skips the confirmation and opens the details in that marketplace', () => {
    expect(plan({ ...command, marketplaceAdded: true })).toMatchObject({
      confirmsMarketplace: false,
      addsMarketplace: false,
      opensDetails: true,
    });
  });

  test('in a session the source cannot contain spaces', () => {
    const refused = planInstallCommand({ ...command, marketplace: 'my org/plugins' });
    expect('severity' in refused && refused.message).toContain("can't contain spaces");
  });

  test('the plugin name is given by itself, without an @marketplace suffix', () => {
    const refused = planInstallCommand({ ...command, plugin: 'deploy-helper@your-org' });
    expect('severity' in refused && refused.message).toContain('without an @marketplace suffix');
  });
});

spec('install.guide.Add and install from your shell', () => {
  const command = {
    surface: 'shell',
    plugin: 'deploy-helper',
    marketplace: 'your-org/plugins',
  } as const;

  test('the shell adds the marketplace without a confirmation step, declared in user settings even with --scope project', () => {
    expect(plan({ ...command, scope: 'project' })).toMatchObject({
      addsMarketplace: true,
      confirmsMarketplace: false,
      marketplaceDeclaredIn: 'user',
      installs: true,
      scope: 'project',
    });
  });

  test('a marketplace already added from that source is reused', () => {
    expect(plan({ ...command, marketplaceAdded: true })).toMatchObject({
      addsMarketplace: false,
      marketplaceDeclaredIn: undefined,
    });
  });

  test('it prints the marketplace line and then installs the plugin', () => {
    expect(
      shellInstallLines({
        pluginId: 'deploy-helper@plugins',
        scope: 'user',
        addedMarketplace: 'plugins',
      }),
    ).toEqual([
      'Successfully added marketplace: plugins (declared in user settings)',
      'Successfully installed plugin: deploy-helper@plugins (scope: user)',
    ]);
  });
});
