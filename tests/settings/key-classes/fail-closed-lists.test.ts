/**
 * managed-settings.md § Keys that fail closed (the table of keys "that have their own fallback"):
 * what a managed source's unreadable value of each allowlist or denylist reads as, and what happens
 * to an individual invalid entry. "This tolerance applies only to managed settings" (the same
 * value in a user file is dropped).
 */
import { describe, expect, test } from 'bun:test';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'policy.managed.Keys that fail closed';
const managed = (raw: unknown) => viewOf(['managed', raw]);
const said = (raw: unknown) => messagesOf('managed', raw);
const hasMessage = (raw: unknown, part: string) =>
  said(raw).some((message) => message.includes(part));

spec(`${ID}.allowedChannelPlugins`, () => {
  test('a value that is no list is an empty allowlist: no channel plugin is admitted', () => {
    const raw = { allowedChannelPlugins: 'telegram' };
    expect(managed(raw).get('allowedChannelPlugins')).toEqual([]);
    expect(hasMessage(raw, '"allowedChannelPlugins" was present but invalid')).toBe(true);
  });

  test('an individual invalid entry is stripped and the rest enforced', () => {
    const raw = {
      allowedChannelPlugins: [
        { marketplace: 'claude-plugins-official', plugin: 'telegram' },
        'discord@claude-plugins-official',
        5,
        { plugin: 'no-marketplace' },
      ],
    };
    expect(managed(raw).get('allowedChannelPlugins')).toEqual([
      { marketplace: 'claude-plugins-official', plugin: 'telegram' },
      { marketplace: 'claude-plugins-official', plugin: 'discord' },
    ]);
    expect(said(raw)).toHaveLength(2);
  });
});

for (const key of ['allowedHttpHookUrls', 'httpHookAllowedEnvVars'] as const) {
  spec(`${ID}.${key}`, () => {
    test('a value that is no list is enforced as an empty managed allowlist', () => {
      const raw = { [key]: 'https://hooks.example.com/*' };
      expect(managed(raw).get(key)).toEqual([]);
      expect(hasMessage(raw, `"${key}" was present but invalid`)).toBe(true);
    });

    test('it merges across files, so entries of the user file still apply while the managed list is empty', () => {
      const view = viewOf(['managed', { [key]: 42 }], ['user', { [key]: ['ENTRY_FROM_USER'] }]);
      expect(view.get(key)).toEqual(['ENTRY_FROM_USER']);
    });

    test('an individual invalid entry is stripped and the rest enforced', () => {
      expect(managed({ [key]: ['KEPT', 7, null] }).get(key)).toEqual(['KEPT']);
    });
  });
}

spec(`${ID}.allowedMcpServers`, () => {
  test('a value that is no list is an empty allowlist: no server users add is admitted', () => {
    const raw = { allowedMcpServers: { serverName: 'search' } };
    expect(managed(raw).get('allowedMcpServers')).toEqual([]);
    expect(hasMessage(raw, 'was present but invalid')).toBe(true);
  });

  test('an individual invalid entry is stripped and the valid subset is enforced', () => {
    const raw = {
      allowedMcpServers: [
        { serverName: 'search' },
        { serverUrl: 'https://mcp.example.com/*' },
        { serverCommand: ['npx', 'server'] },
        { serverName: 5 },
        { serverCommand: [] },
        'search',
        {},
      ],
    };
    expect(managed(raw).get('allowedMcpServers')).toEqual([
      { serverName: 'search' },
      { serverUrl: 'https://mcp.example.com/*' },
      { serverCommand: ['npx', 'server'] },
    ]);
    expect(said(raw)).toHaveLength(4);
  });
});

spec(`${ID}.allowedProviders`, () => {
  test('a value that is no list is an empty allowlist: every provider is refused', () => {
    const raw = { allowedProviders: 'bedrock' };
    expect(managed(raw).get('allowedProviders')).toEqual([]);
    expect(hasMessage(raw, 'every API provider is refused')).toBe(true);
  });

  test('an entry that is no known provider name is dropped and reported, the rest enforced', () => {
    const raw = { allowedProviders: ['bedrock', 'azure', 'gateway'] };
    expect(managed(raw).get('allowedProviders')).toEqual(['bedrock', 'gateway']);
    expect(said(raw)).toHaveLength(1);
  });
});

spec(`${ID}.availableModels`, () => {
  test('a value that is no list is an empty allowlist, so only the Default model is available', () => {
    const raw = { availableModels: 'opus' };
    expect(managed(raw).get('availableModels')).toEqual([]);
    expect(hasMessage(raw, 'only the Default model is available')).toBe(true);
  });

  test('a non-string entry is stripped and the valid subset enforced', () => {
    expect(managed({ availableModels: ['opus', 5, 'sonnet'] }).get('availableModels')).toEqual([
      'opus',
      'sonnet',
    ]);
  });

  test('in a user file the same value is only dropped', () => {
    expect(viewOf(['user', { availableModels: 'opus' }]).get('availableModels')).toBeUndefined();
  });
});

spec(`${ID}.availableModelsMatch`, () => {
  test('an unreadable value is treated as exact', () => {
    const raw = { availableModelsMatch: 'fuzzy' };
    expect(managed(raw).get('availableModelsMatch')).toBe('exact');
    expect(hasMessage(raw, 'was present but invalid')).toBe(true);
  });

  test('the two documented values are kept as they are', () => {
    expect(managed({ availableModelsMatch: 'prefix' }).get('availableModelsMatch')).toBe('prefix');
    expect(managed({ availableModelsMatch: 'exact' }).get('availableModelsMatch')).toBe('exact');
  });
});

spec(`${ID}.blockedMarketplaces`, () => {
  const github = { source: 'github', repo: 'evil/plugins' } as const;

  test('an individual invalid entry is stripped and the valid subset is enforced', () => {
    expect(
      managed({ blockedMarketplaces: [github, { source: 'github' }, 'x'] }).get(
        'blockedMarketplaces',
      ),
    ).toEqual([github]);
  });

  test('an entry that can never match, a hostPattern regex that does not compile, is kept with a warning', () => {
    const never = { source: 'hostPattern', hostPattern: '(' };
    const raw = { blockedMarketplaces: [github, never] };
    expect(plain(managed(raw).get('blockedMarketplaces'))).toEqual([github, never]);
    expect(hasMessage(raw, 'blocks nothing')).toBe(true);
  });

  test('a wholly invalid value is dropped with a warning, since blocking every marketplace would block sources never named', () => {
    const raw = { blockedMarketplaces: 'evil' };
    expect(managed(raw).get('blockedMarketplaces')).toBeUndefined();
    expect(hasMessage(raw, 'the key is ignored')).toBe(true);
  });
});

spec(`${ID}.deniedMcpServers`, () => {
  test('an individual invalid entry is stripped and the valid subset is enforced', () => {
    const raw = { deniedMcpServers: [{ serverName: 'evil' }, { serverName: 5 }] };
    expect(managed(raw).get('deniedMcpServers')).toEqual([{ serverName: 'evil' }]);
    expect(said(raw)).toHaveLength(1);
  });

  test('a wholly invalid value is dropped with a warning, since denying every server would block servers never named', () => {
    const raw = { deniedMcpServers: 'evil' };
    expect(managed(raw).get('deniedMcpServers')).toBeUndefined();
    expect(hasMessage(raw, 'the key is ignored')).toBe(true);
  });
});

spec(`${ID}.deniedModels`, () => {
  test('a non-string entry is stripped and the rest of the list is enforced', () => {
    expect(managed({ deniedModels: ['opus', 3, 'claude-opus-5-5'] }).get('deniedModels')).toEqual([
      'opus',
      'claude-opus-5-5',
    ]);
  });

  test('a wholly invalid value is dropped with a warning and blocks no models', () => {
    const raw = { deniedModels: 'opus' };
    expect(managed(raw).get('deniedModels')).toBeUndefined();
    expect(hasMessage(raw, 'the key is ignored')).toBe(true);
  });
});

spec(`${ID}.enabledPlugins`, () => {
  test('an invalid entry is dropped with a warning and the other entries stay enforced', () => {
    const raw = { enabledPlugins: { 'formatter@team-tools': true, 'no-marketplace': true } };
    expect(managed(raw).get('enabledPlugins')).toEqual({ 'formatter@team-tools': true });
    expect(said(raw)).toHaveLength(1);
  });

  describe('a value that is no map of plugin ids, or whose every entry is invalid, is dropped whole with a warning', () => {
    test('no map', () => {
      const raw = { enabledPlugins: ['formatter@team-tools'] };
      expect(managed(raw).get('enabledPlugins')).toBeUndefined();
      expect(said(raw)).toHaveLength(1);
    });

    test('every entry invalid', () => {
      const raw = { enabledPlugins: { a: true, b: false } };
      expect(managed(raw).get('enabledPlugins')).toBeUndefined();
      expect(hasMessage(raw, 'Every entry is invalid')).toBe(true);
    });
  });
});

spec(`${ID}.forceLoginOrgUUID`, () => {
  test('an unreadable value permits no organization to log in until fixed', () => {
    const raw = { forceLoginOrgUUID: 42 };
    expect(managed(raw).get('forceLoginOrgUUID')).toEqual([]);
    expect(hasMessage(raw, 'no organization is permitted to log in')).toBe(true);
  });

  test('one UUID and a list of UUIDs are readable', () => {
    expect(managed({ forceLoginOrgUUID: 'org-a' }).get('forceLoginOrgUUID')).toBe('org-a');
    expect(managed({ forceLoginOrgUUID: ['org-a', 'org-b'] }).get('forceLoginOrgUUID')).toEqual([
      'org-a',
      'org-b',
    ]);
  });

  test('a list that is not an array of strings permits no organization: one non-text entry makes the whole value unreadable', () => {
    for (const value of [['org-a', 5], [5], ['org-a', null], ['org-a', ['org-b']]]) {
      const raw = { forceLoginOrgUUID: value };
      expect(managed(raw).get('forceLoginOrgUUID')).toEqual([]);
      expect(hasMessage(raw, 'no organization is permitted to log in')).toBe(true);
    }
  });

  test('an empty array stays empty: no organization is permitted either', () => {
    expect(managed({ forceLoginOrgUUID: [] }).get('forceLoginOrgUUID')).toEqual([]);
  });

  test('in a user file an unreadable value is only dropped', () => {
    expect(viewOf(['user', { forceLoginOrgUUID: 42 }]).get('forceLoginOrgUUID')).toBeUndefined();
  });
});

spec(`${ID}.strictKnownMarketplaces`, () => {
  const github = { source: 'github', repo: 'acme/plugins' } as const;

  test('an unreadable value is an empty allowlist, so no marketplace source is admitted', () => {
    const raw = { strictKnownMarketplaces: 'acme/plugins' };
    expect(managed(raw).get('strictKnownMarketplaces')).toEqual([]);
    expect(hasMessage(raw, 'was present but invalid')).toBe(true);
  });

  test('an entry that is invalid or cannot be enforced is stripped and the valid subset enforced', () => {
    const raw = {
      strictKnownMarketplaces: [
        github,
        { source: 'hostPattern', hostPattern: '(' },
        { source: 'nope' },
      ],
    };
    expect(managed(raw).get('strictKnownMarketplaces')).toEqual([github]);
    expect(said(raw)).toHaveLength(2);
  });
});
