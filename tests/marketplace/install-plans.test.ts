/**
 * plugins/install.md § Manage installed plugins (the details menu offers Disable or Enable, Update
 * now and Uninstall, Configure options for a `userConfig`, Configure for a bundled MCP server; a
 * Managed plugin cannot be enabled, disabled or uninstalled in the panel; closing the panel with
 * pending changes runs `/reload-plugins`, or warns and leaves them pending when the reload would
 * invalidate the prompt cache), § Uninstall a plugin the project enables (Disable for me: `y`; Uninstall
 * for everyone: `u`), and, while a response streams, `Run /reload-plugins to apply.` (the reload is
 * queued); the marketplace commands are in install-marketplace-plans.test.ts.
 */
import { expect, test } from 'bun:test';
import { closePanel, pluginActions, uninstallChoice } from '../../src/marketplace/install-plans.ts';
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
    expect(closePanel({ pending: true, invalidatesPromptCache: false, streaming: false })).toEqual({
      reload: 'run',
    });
  });

  test('when the reload would invalidate the prompt cache it warns and leaves the changes pending, for --force', () => {
    expect(closePanel({ pending: true, invalidatesPromptCache: true, streaming: false })).toEqual({
      reload: 'warn-and-leave-pending',
      forceCommand: '/reload-plugins --force',
    });
  });

  test('while a response is streaming the reload is queued until it finishes', () => {
    expect(closePanel({ pending: true, invalidatesPromptCache: false, streaming: true })).toEqual({
      reload: 'queue-until-response-ends',
    });
  });

  test('a judgment: the prompt-cache warning comes before the queue', () => {
    expect(closePanel({ pending: true, invalidatesPromptCache: true, streaming: true })).toEqual({
      reload: 'warn-and-leave-pending',
      forceCommand: '/reload-plugins --force',
    });
  });

  test('with no pending change nothing runs', () => {
    expect(closePanel({ pending: false, invalidatesPromptCache: true, streaming: true })).toEqual({
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
