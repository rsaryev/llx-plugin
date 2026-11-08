/**
 * settings-reference.md § `disableCommandPluginSources` ("Block the `command` plugin source ...
 * `true`: never runs the command, doesn't install or update command-sourced plugins, and stops
 * loading the ones already installed. `false`: allows them explicitly. Default: unset, so Claude Code
 * follows `allowManagedHooksOnly` ... An application that passes `disableAllHooks: true` in the Agent
 * SDK's `managedSettings` option doesn't by itself disable command sources"; Scope: Managed),
 * § "What runs under `allowManagedHooksOnly`" (command-sourced plugins, "including plugins
 * force-enabled in managed `enabledPlugins`, unless you set `disableCommandPluginSources` to `false`
 * explicitly"; `headersHelper` commands blocked "except for a marketplace that managed settings
 * themselves declare"), plugins/host-marketplace.md § "When Claude Code skips a headersHelper
 * command" and § "When a marketplace `url` source's command runs". The non-`https://` `url` source
 * is planned by the registry (`registry-entries.test.ts`), which drops its helper.
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf } from '../../support/settings-layers.ts';
import { commandSourcesOf } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

const blockedBy = (reason: 'disableCommandPluginSources' | 'allowManagedHooksOnly') =>
  ({ run: false, reason }) as const;

spec('settings.key.disableCommandPluginSources', () => {
  describe('the effective value', () => {
    test('true blocks command sources', () => {
      const policy = commandSourcesOf(['managed', { disableCommandPluginSources: true }]);
      expect(policy.disabled).toBe(true);
      expect(policy.pluginSource).toEqual(blockedBy('disableCommandPluginSources'));
    });

    test('false allows them explicitly', () => {
      const policy = commandSourcesOf(['managed', { disableCommandPluginSources: false }]);
      expect(policy.disabled).toBe(false);
      expect(policy.pluginSource).toEqual({ run: true });
    });

    test('unset with nothing else set allows them', () => {
      expect(commandSourcesOf().disabled).toBe(false);
      expect(commandSourcesOf(['managed', {}]).pluginSource).toEqual({ run: true });
    });

    test('unset follows allowManagedHooksOnly: an organization that restricts hooks gets command sources disabled too', () => {
      const policy = commandSourcesOf(['managed', { allowManagedHooksOnly: true }]);
      expect(policy.disabled).toBe(true);
      expect(policy.pluginSource).toEqual(blockedBy('allowManagedHooksOnly'));
      expect(commandSourcesOf(['managed', { allowManagedHooksOnly: false }]).disabled).toBe(false);
    });

    test('an explicit false wins over allowManagedHooksOnly, an explicit true needs no allowManagedHooksOnly', () => {
      const allowed = commandSourcesOf([
        'managed',
        { allowManagedHooksOnly: true, disableCommandPluginSources: false },
      ]);
      expect(allowed.disabled).toBe(false);
      expect(allowed.pluginSource).toEqual({ run: true });
      const blocked = commandSourcesOf([
        'managed',
        { allowManagedHooksOnly: false, disableCommandPluginSources: true },
      ]);
      expect(blocked.pluginSource).toEqual(blockedBy('disableCommandPluginSources'));
    });

    test('disableAllHooks in the SDK managedSettings does not by itself disable command sources', () => {
      expect(commandSourcesOf(['parent', { disableAllHooks: true }]).disabled).toBe(false);
      expect(commandSourcesOf(['managed', { disableAllHooks: true }]).disabled).toBe(false);
    });
  });

  describe('scope: managed only', () => {
    test('a user, project, local or --settings file cannot set the key or the key it follows', () => {
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        const disable = { disableCommandPluginSources: true };
        expect(commandSourcesOf([scope, disable]).disabled).toBe(false);
        expect(issuesOf(scope, disable).length).toBeGreaterThan(0);
        expect(commandSourcesOf([scope, { allowManagedHooksOnly: true }]).disabled).toBe(false);
      }
    });

    test('a managed false is not overridden by a user true', () => {
      const policy = commandSourcesOf(
        ['managed', { disableCommandPluginSources: false }],
        ['user', { disableCommandPluginSources: true }],
      );
      expect(policy.disabled).toBe(false);
    });
  });

  describe('marketplace headersHelper commands', () => {
    test('are blocked whenever command sources are blocked, whether set to true or left unset under allowManagedHooksOnly', () => {
      for (const managed of [
        { disableCommandPluginSources: true },
        { allowManagedHooksOnly: true },
      ]) {
        const policy = commandSourcesOf(['managed', managed]);
        for (const from of ['user', 'project', 'local', 'flag'] as const) {
          expect(policy.headersHelper(from).run).toBe(false);
        }
      }
    });

    test('still run for a marketplace that managed settings themselves declare', () => {
      const policy = commandSourcesOf(['managed', { disableCommandPluginSources: true }]);
      expect(policy.headersHelper('managed')).toEqual({ run: true });
    });

    test('run when command sources are allowed, and with an explicit false under allowManagedHooksOnly', () => {
      expect(commandSourcesOf().headersHelper('user')).toEqual({ run: true });
      const explicit = commandSourcesOf([
        'managed',
        { allowManagedHooksOnly: true, disableCommandPluginSources: false },
      ]);
      expect(explicit.headersHelper('project')).toEqual({ run: true });
    });

    test('a blocked helper names the key that blocks it', () => {
      const policy = commandSourcesOf(['managed', { allowManagedHooksOnly: true }]);
      expect(policy.headersHelper('user')).toEqual(blockedBy('allowManagedHooksOnly'));
    });
  });
});
