/**
 * managed-settings.md § Keys only a managed source can set: "Claude Code reads the following keys
 * only from a managed source; placing them in user or project settings files has no effect."
 * settings-reference.md, each key's **Scope: Managed** line ("Claude Code ignores the key in user,
 * project, and local settings and in `--settings`, with a warning"; `managedMcpServers`: "drops the
 * key with a warning in user, project, and local settings").
 */
import { describe, expect, test } from 'bun:test';
import { compose } from '../../support/managed.ts';
import { messagesOf, nest, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'policy.managed.Keys only a managed source can set';

const SERVER = { type: 'http', url: 'https://mcp.example.com' };

/** Each key of the table with a value its repair keeps as it is. */
const KEYS = [
  ['allowAllClaudeAiMcps', true],
  ['allowedChannelPlugins', [{ marketplace: 'claude-plugins-official', plugin: 'telegram' }]],
  ['allowManagedHooksOnly', true],
  ['allowManagedMcpServersOnly', true],
  ['allowManagedPermissionRulesOnly', true],
  ['blockedMarketplaces', [{ source: 'github', repo: 'evil/plugins' }]],
  ['channelsEnabled', true],
  ['disableCommandPluginSources', true],
  ['disableSideloadFlags', true],
  ['forceRemoteSettingsRefresh', true],
  ['managedMcpServers', { search: SERVER }],
  ['managedSourcesBehavior', 'merge'],
  ['parentSettingsBehavior', 'merge'],
  ['pluginSuggestionMarketplaces', ['acme']],
  ['pluginTrustMessage', 'Plugins here are reviewed by security.'],
  ['policyHelper', { path: '/opt/policy-helper' }],
  ['sandbox.network.allowManagedDomainsOnly', true],
  ['strictKnownMarketplaces', [{ source: 'github', repo: 'acme/plugins' }]],
  ['strictPluginOnlyCustomization', true],
  ['wslInheritsWindowsSettings', true],
] as const;

const FILES = ['user', 'project', 'local', 'flag'] as const;

for (const [key, value] of KEYS) {
  const raw = nest(key, value);
  spec(`${ID}.${key}`, () => {
    test('a managed source sets it', () => {
      expect(plain(viewOf(['managed', raw]).get(key))).toEqual(value);
    });

    describe('placed in a user, project, local or --settings file it has no effect, with a warning', () => {
      for (const scope of FILES) {
        test(scope, () => {
          expect(viewOf([scope, raw]).get(key)).toBeUndefined();
          expect(messagesOf(scope, raw).some((message) => message.includes(`"${key}"`))).toBe(true);
        });
      }
    });

    test('a file below managed settings does not change the managed value', () => {
      expect(plain(viewOf(['managed', raw], ['user', nest(key, 'nope')]).get(key))).toEqual(value);
    });
  });
}

spec(`${ID}.forceRemoteSettingsRefresh`, () => {
  test('a true from any admin source counts, even one that is not the highest-priority source', () => {
    expect(
      compose({ remote: { model: 'a' }, file: { forceRemoteSettingsRefresh: true } })
        .forceRemoteRefresh,
    ).toBe(true);
    expect(compose({ file: { model: 'a' } }).forceRemoteRefresh).toBe(false);
  });
});

spec(`${ID}.managedSourcesBehavior`, () => {
  test('a lower source cannot opt itself in to combining with the source above it', () => {
    const lower = compose({
      plist: { model: 'a' },
      file: { managedSourcesBehavior: 'merge', cleanupPeriodDays: 1 },
    });
    expect(lower.behavior).toBe('first-wins');
    expect(
      compose({
        plist: { managedSourcesBehavior: 'merge', model: 'a' },
        file: { cleanupPeriodDays: 1 },
      }).behavior,
    ).toBe('merge');
  });
});

spec(`${ID}.parentSettingsBehavior`, () => {
  test('it is read from the highest-priority admin source only', () => {
    expect(
      compose({ plist: { model: 'a' }, file: { parentSettingsBehavior: 'merge' } }).parentMerge,
    ).toBe(false);
    expect(compose({ plist: { parentSettingsBehavior: 'merge', model: 'a' } }).parentMerge).toBe(
      true,
    );
  });
});
