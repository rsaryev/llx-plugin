/**
 * managed-settings.md § Keys only a managed source can set: "Claude Code reads the following keys
 * only from a managed source; placing them in user or project settings files has no effect."
 * settings-reference.md, each key's **Scope: Managed** line ("Claude Code ignores the key in user,
 * project, and local settings and in `--settings`, with a warning"; `managedMcpServers`: "drops the
 * key with a warning in user, project, and local settings").
 *
 * The loop below proves each key's scope; a row's own effect is proven where the key's area is
 * tested, and by the tests of this file where it is not:
 * - `allowedChannelPlugins` "requires `channelsEnabled: true`" and "replaces the default allowlist":
 *   tests/settings/channels/allowlist.test.ts.
 * - `allowManagedHooksOnly`: tests/settings/hooks/managed-only.test.ts.
 * - `allowManagedMcpServersOnly`: below ("only `allowedMcpServers` from managed settings are
 *   respected", "`deniedMcpServers` still merges from all sources") and, for which admin source may
 *   set it, tests/settings/managed/first-wins.test.ts.
 * - `disableCommandPluginSources` "when unset, follows `allowManagedHooksOnly`":
 *   tests/settings/marketplaces/command-sources.test.ts.
 * - `allowAllClaudeAiMcps`: the kit carries the key and its cross-source rule (first-wins.test.ts);
 *   fetching the claude.ai connectors is the host's.
 * - `sandbox.filesystem.allowManagedReadPathsOnly` has no requirement id (the docs extractor merges
 *   its row into the next one): its scope is proven at the end of this file, outside `spec(...)`.
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

spec([`${ID}.forceRemoteSettingsRefresh`, 'policy.server.Managed-only settings'], () => {
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

spec(`${ID}.allowManagedMcpServersOnly`, () => {
  const server = (name: string) => [{ serverName: name }];
  const lock = [
    'managed',
    { allowManagedMcpServersOnly: true, allowedMcpServers: server('org') },
  ] as const;

  test('only allowedMcpServers from managed settings are respected', () => {
    const view = viewOf(
      lock,
      ['flag', { allowedMcpServers: server('flag') }],
      ['local', { allowedMcpServers: server('local') }],
      ['project', { allowedMcpServers: server('project') }],
      ['user', { allowedMcpServers: server('user') }],
    );
    expect(view.get('allowedMcpServers')).toEqual(server('org'));
  });

  test('without the lock the lists of every file combine', () => {
    const view = viewOf(
      ['managed', { allowedMcpServers: server('org') }],
      ['user', { allowedMcpServers: server('user') }],
    );
    expect(view.get('allowedMcpServers')).toEqual([...server('org'), ...server('user')]);
    const off = viewOf(
      ['managed', { allowManagedMcpServersOnly: false, allowedMcpServers: server('org') }],
      ['user', { allowedMcpServers: server('user') }],
    );
    expect(off.get('allowedMcpServers')).toEqual([...server('org'), ...server('user')]);
  });

  test('with no managed list the files add nothing, and the parent list applies only when no admin source sets one', () => {
    const noList = viewOf(
      ['managed', { allowManagedMcpServersOnly: true }],
      ['user', { allowedMcpServers: server('user') }],
    );
    expect(noList.get('allowedMcpServers')).toBeUndefined();
    const parent = ['parent', { allowedMcpServers: server('host') }] as const;
    expect(
      viewOf(['managed', { allowManagedMcpServersOnly: true }], parent).get('allowedMcpServers'),
    ).toEqual(server('host'));
    expect(viewOf(lock, parent).get('allowedMcpServers')).toEqual(server('org'));
  });

  test('deniedMcpServers still merges from all sources', () => {
    const view = viewOf(
      ['managed', { allowManagedMcpServersOnly: true, deniedMcpServers: server('a') }],
      ['project', { deniedMcpServers: server('b') }],
      ['user', { deniedMcpServers: server('c') }],
    );
    expect(view.get('deniedMcpServers')).toEqual([...server('a'), ...server('b'), ...server('c')]);
  });
});

describe('sandbox.filesystem.allowManagedReadPathsOnly: a managed source only (no requirement id)', () => {
  const KEY = 'sandbox.filesystem.allowManagedReadPathsOnly';
  const raw = nest(KEY, true);

  test('a managed source sets it', () => {
    expect(viewOf(['managed', raw]).get(KEY)).toBe(true);
  });

  for (const scope of [...FILES, 'parent'] as const) {
    test(`placed in a ${scope} file it has no effect, with a warning that names the key`, () => {
      expect(viewOf([scope, raw]).get(KEY)).toBeUndefined();
      if (scope !== 'parent') {
        expect(messagesOf(scope, raw).some((message) => message.includes(`"${KEY}"`))).toBe(true);
      }
    });
  }

  test('the rest of the sandbox block of that file stays', () => {
    const block = {
      sandbox: { filesystem: { allowManagedReadPathsOnly: true, allowRead: ['/d'] } },
    };
    expect(plain(viewOf(['project', block]).get('sandbox'))).toEqual({
      filesystem: { allowRead: ['/d'] },
    });
  });
});
