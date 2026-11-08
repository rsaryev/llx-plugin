/**
 * plugins/install.md § Install a plugin (the tabs: Terminal, Desktop app, VS Code, Cloud session),
 * § Install from your shell (When the plugins load), § JetBrains, non-interactive runs, and the
 * Agent SDK. What each host's install surface does, through the plans a host runs.
 */
import { describe, expect, test } from 'bun:test';
import {
  installWith,
  loadsInstalledPlugins,
  marketplacesAddedAtStart,
  planPluginApply,
  planPluginCommand,
  scopeChoices,
  type InstallHost,
} from '../../src/marketplace/install-hosts.ts';
import { inlinePluginId } from '../../src/marketplace/session-origins.ts';
import { spec } from '../support/spec.ts';

spec('install.guide.Install a plugin', () => {
  test('a cloud session has no plugin browser and does not load the plugins installed on your machine or turned on by the repository', () => {
    expect(planPluginCommand({ host: 'cloud' })).toEqual({ opens: undefined, reply: undefined });
    expect(installWith('cloud')).toBe('none');
    expect(scopeChoices('cloud')).toEqual([]);
    expect(loadsInstalledPlugins('cloud')).toBe(false);
    expect(loadsInstalledPlugins('terminal')).toBe(true);
  });

  test('/plugin with no plugin name opens the panel on the Discover tab, and with a name on that plugin', () => {
    expect(planPluginCommand({ host: 'terminal' })).toEqual({
      opens: 'discover',
      reply: undefined,
    });
    expect(planPluginCommand({ host: 'terminal', plugin: 'commit-commands' }).opens).toBe(
      'details',
    );
  });

  test('every surface that installs offers the three scopes: you, this repository for everyone, this repository for you', () => {
    const hosts: InstallHost[] = ['terminal', 'jetbrains', 'desktop', 'vscode'];
    for (const host of hosts) {
      expect(scopeChoices(host)).toEqual(['user', 'project', 'local']);
    }
    expect(scopeChoices('non-interactive')).toEqual([]);
    expect(scopeChoices('agent-sdk')).toEqual([]);
  });

  test('the desktop app and VS Code have their own surfaces, not the /plugin panel', () => {
    expect(installWith('desktop')).toBe('plugin-browser');
    expect(installWith('vscode')).toBe('manage-plugins');
    expect(planPluginCommand({ host: 'desktop' }).opens).toBeUndefined();
    expect(planPluginCommand({ host: 'vscode' }).opens).toBeUndefined();
  });

  test('VS Code applies a change to open sessions without a restart; a shell install waits for the next start or a reload', () => {
    expect(planPluginApply('vscode', 'surface')).toEqual(['open-sessions']);
    expect(planPluginApply('vscode', 'shell')).toEqual(['next-start', 'reload-plugins']);
    expect(planPluginApply('terminal', 'surface')).toEqual(['install-summary']);
    expect(planPluginApply('desktop', 'surface')).toBeUndefined();
  });

  test('the official marketplace is added the first time an interactive terminal session starts, and not again', () => {
    const official = {
      name: 'claude-plugins-official',
      source: 'anthropics/claude-plugins-official',
    };
    const first = { firstInteractiveStart: true, registered: [] };
    expect(marketplacesAddedAtStart({ host: 'terminal', ...first })).toEqual([official]);
    expect(
      marketplacesAddedAtStart({ host: 'terminal', firstInteractiveStart: false, registered: [] }),
    ).toEqual([]);
    expect(
      marketplacesAddedAtStart({
        host: 'terminal',
        firstInteractiveStart: true,
        registered: ['claude-plugins-official'],
      }),
    ).toEqual([]);
    for (const host of ['desktop', 'vscode', 'non-interactive', 'agent-sdk', 'cloud'] as const) {
      expect(marketplacesAddedAtStart({ host, ...first })).toEqual([]);
    }
  });
});

spec('install.guide.Install from your shell.When the plugins load', () => {
  test('plugins it installs load the next time you start Claude Code, or on /reload-plugins in an open session, on every host with a shell', () => {
    for (const host of ['terminal', 'non-interactive', 'cloud'] as const) {
      expect(planPluginApply(host, 'shell')).toEqual(['next-start', 'reload-plugins']);
    }
  });
});

const NON_INTERACTIVE = 'install.guide.JetBrains, non-interactive runs, and the Agent SDK';

spec(`${NON_INTERACTIVE}.JetBrains IDEs`, () => {
  test('the plugin runs Claude Code in the IDE terminal, so the Terminal tab steps apply there', () => {
    expect(installWith('jetbrains')).toBe('terminal-steps');
    expect(planPluginCommand({ host: 'jetbrains' })).toEqual(
      planPluginCommand({ host: 'terminal' }),
    );
    expect(scopeChoices('jetbrains')).toEqual(scopeChoices('terminal'));
    expect(planPluginApply('jetbrains', 'surface')).toEqual(planPluginApply('terminal', 'surface'));
    expect(
      marketplacesAddedAtStart({ host: 'jetbrains', firstInteractiveStart: true, registered: [] }),
    ).toEqual(
      marketplacesAddedAtStart({ host: 'terminal', firstInteractiveStart: true, registered: [] }),
    );
  });
});

spec(`${NON_INTERACTIVE}.claude -p and other non-interactive runs`, () => {
  test('/plugin does not run and Claude replies it is not available; plugins already installed do load, and are managed from the shell', () => {
    expect(planPluginCommand({ host: 'non-interactive' })).toEqual({
      opens: undefined,
      reply: "/plugin isn't available in this environment.",
    });
    expect(loadsInstalledPlugins('non-interactive')).toBe(true);
    expect(installWith('non-interactive')).toBe('shell-commands');
    expect(planPluginCommand({ host: 'terminal' }).reply).toBeUndefined();
  });
});

spec(`${NON_INTERACTIVE}.Agent SDK`, () => {
  test('plugins load through the SDK plugins option, which is a session-only <name>@inline plugin like --plugin-dir', () => {
    expect(installWith('agent-sdk')).toBe('sdk-plugins-option');
    expect(planPluginCommand({ host: 'agent-sdk' }).opens).toBeUndefined();
    expect(inlinePluginId('my-plugin')).toBe('my-plugin@inline');
  });
});

describe('judgments: install commands', () => {
  test('the docs say nothing of whether installed plugins load through the Agent SDK', () => {
    expect(loadsInstalledPlugins('agent-sdk')).toBeUndefined();
  });

  test('a terminal installs through the panel, and no host but the terminal and JetBrains opens it', () => {
    expect(installWith('terminal')).toBe('panel');
    const hosts: InstallHost[] = [
      'terminal',
      'jetbrains',
      'desktop',
      'vscode',
      'non-interactive',
      'agent-sdk',
      'cloud',
    ];
    const opening = hosts.filter((host) => planPluginCommand({ host }).opens !== undefined);
    expect(opening).toEqual(['terminal', 'jetbrains']);
  });

  test('JetBrains starts a terminal session in the IDE, so it too registers the official marketplace on its first start', () => {
    expect(
      marketplacesAddedAtStart({ host: 'jetbrains', firstInteractiveStart: true, registered: [] }),
    ).toHaveLength(1);
  });
});
