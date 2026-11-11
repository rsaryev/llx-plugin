/**
 * plugins/troubleshooting.md § Policy refusals: the three entries whose line the kit words.
 */
import { expect, test } from 'bun:test';
import {
  commandSourceDisabledMessage,
  pluginBlockedMessage,
  skillsDirectoryBlockedMessage,
} from '../../../src/settings/marketplaces/index.ts';
import { spec } from '../../support/spec.ts';

spec(
  "policy.troubleshooting.Plugins from ~/.claude/skills/ are blocked by your organization's managed settings",
  () => {
    test('names both keys and asks to add or remove the skills-dir entry', () => {
      const message = skillsDirectoryBlockedMessage();
      expect(message).toStartWith(
        "Plugins from ~/.claude/skills/ are blocked by your organization's managed settings",
      );
      expect(message).toContain('strictKnownMarketplaces or blockedMarketplaces');
      expect(message).toContain('{"source":"skills-dir"}');
    });
  },
);

spec(
  "policy.troubleshooting.Command-sourced plugins are disabled by your organization's managed settings",
  () => {
    test('says the plugin was not installed or updated and its command was not run', () => {
      expect(commandSourceDisabledMessage()).toBe(
        "Command-sourced plugins are disabled by your organization's managed settings. The plugin was not installed or updated and its command was not run.",
      );
    });
  },
);

spec(
  'policy.troubleshooting.Plugin "<name>" is blocked by your organization\'s policy and cannot be installed',
  () => {
    test('install and enable end differently', () => {
      expect(pluginBlockedMessage('p', { kind: 'plugin', action: 'install' })).toBe(
        'Plugin "p" is blocked by your organization\'s policy and cannot be installed',
      );
      expect(pluginBlockedMessage('p', { kind: 'plugin', action: 'enable' })).toEndWith(
        'cannot be enabled',
      );
    });
    test('a blocked marketplace or dependency names the reason', () => {
      expect(pluginBlockedMessage('p', { kind: 'marketplace', marketplace: 'm' })).toBe(
        'Plugin "p" is from marketplace "m", which is blocked by your organization\'s policy',
      );
      expect(pluginBlockedMessage('p', { kind: 'dependency', dependency: 'd' })).toBe(
        'Plugin "p" depends on "d", which is blocked by your organization\'s policy',
      );
    });
  },
);
