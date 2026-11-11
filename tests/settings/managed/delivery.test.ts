/**
 * managed-settings.md § Deploy a managed settings file, § Choose a delivery mechanism (the table),
 * § Where each mechanism stores the policy, § What a developer can change; plugins/org.md § Which
 * managed source applies on a machine.
 */
import { describe, expect, test } from 'bun:test';
import {
  MDM_SOURCE,
  MECHANISM_TRAITS,
  PLIST_DOMAIN,
  cacheAfterFetch,
  editOfManagedSource,
  managedFilePaths,
  readAdminDocument,
  readFileDocument,
  readsManagedSettingsAt,
  registryPath,
  rereadDue,
  symlinkVerdict,
} from '../../../src/settings/managed/index.ts';
import { compose, found, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';
import { REGISTRY_VALUE } from '../../../src/settings/managed/delivery.ts';

const DEPLOY = 'policy.managed.Deploy a managed settings file';
const CHOOSE = 'policy.managed.Choose a delivery mechanism';
const STORES = 'policy.managed.Where each mechanism stores the policy';

spec(`${DEPLOY}.macOS`, () => {
  test('the file is /Library/Application Support/ClaudeCode/managed-settings.json', () => {
    expect(managedFilePaths('macos').settings).toBe(
      '/Library/Application Support/ClaudeCode/managed-settings.json',
    );
  });
});

spec(`${DEPLOY}.Linux and WSL`, () => {
  test('the file is /etc/claude-code/managed-settings.json on Linux and on WSL', () => {
    expect(managedFilePaths('linux').settings).toBe('/etc/claude-code/managed-settings.json');
    expect(managedFilePaths('wsl').settings).toBe('/etc/claude-code/managed-settings.json');
  });
});

spec(`${DEPLOY}.Windows`, () => {
  test('the file is C:\\Program Files\\ClaudeCode\\managed-settings.json', () => {
    expect(managedFilePaths('windows').settings).toBe(
      'C:\\Program Files\\ClaudeCode\\managed-settings.json',
    );
  });

  test('the legacy C:\\ProgramData\\ClaudeCode path is not read', () => {
    const legacy = 'C:\\ProgramData\\ClaudeCode\\managed-settings.json';
    expect(readsManagedSettingsAt('windows', legacy)).toBe(false);
    expect(readsManagedSettingsAt('windows', managedFilePaths('windows').settings)).toBe(true);
  });
});

spec(`${CHOOSE}.File-based`, () => {
  test('a file is read at startup and reloaded when it changes, not polled', () => {
    expect(rereadDue('file', { minutesSinceRead: 1, changed: true })).toBe(true);
    expect(rereadDue('file', { minutesSinceRead: 500, changed: false })).toBe(false);
  });

  test('it suits machines without MDM: the managed file source is one of the admin sources', () => {
    expect(compose({ file: { model: 'a' } }).settingSources).toBe(
      'Enterprise managed settings (file)',
    );
  });
});

spec(`${CHOOSE}.MDM or OS-level policy`, () => {
  test('a profile or registry value is read at startup and checked for changes every 30 minutes', () => {
    expect(rereadDue('mdm', { minutesSinceRead: 29, changed: true })).toBe(false);
    expect(rereadDue('mdm', { minutesSinceRead: 30, changed: false })).toBe(true);
  });

  test('macOS delivers it as a plist and Windows as an HKLM registry value; Linux has no MDM source', () => {
    expect(MDM_SOURCE).toEqual({ macos: 'plist', linux: undefined, wsl: 'hklm', windows: 'hklm' });
    expect(MECHANISM_TRAITS.mdm.sources).toEqual(['plist', 'hklm']);
  });
});

spec(`${CHOOSE}.Server-managed settings`, () => {
  test('server-managed settings are fetched at startup and polled hourly, and are not endpoint-managed', () => {
    expect(MECHANISM_TRAITS.serverManaged.endpointManaged).toBe(false);
    expect(rereadDue('serverManaged', { minutesSinceRead: 59, changed: false })).toBe(false);
    expect(rereadDue('serverManaged', { minutesSinceRead: 60, changed: false })).toBe(true);
  });

  test('the MDM and file rows are together the endpoint-managed settings', () => {
    const endpoint = Object.entries(MECHANISM_TRAITS)
      .filter(([, traits]) => traits.endpointManaged)
      .map(([name]) => name);
    expect(endpoint.toSorted()).toEqual(['file', 'mdm']);
  });
});

spec(`${CHOOSE}.HKCU registry, Windows and WSL`, () => {
  test('it is read at startup and checked every 30 minutes', () => {
    expect(rereadDue('hkcu', { minutesSinceRead: 29, changed: true })).toBe(false);
    expect(rereadDue('hkcu', { minutesSinceRead: 30, changed: false })).toBe(true);
  });

  test('Claude Code uses it only when no admin document is present above it', () => {
    expect(compose({ hkcu: { model: 'u' } }).used).toEqual(['hkcu']);
    expect(compose({ file: { model: 'f' }, hkcu: { model: 'u' } }).used).toEqual(['file']);
  });

  test('and no host-supplied parent settings supply a restrictive key', () => {
    expect(compose({ hkcu: { model: 'u' } }, true).used).toEqual([]);
  });
});

spec(`${STORES}.macOS configuration profile`, () => {
  test('the com.anthropic.claudecode managed preferences domain holds the same top-level keys', () => {
    expect(PLIST_DOMAIN).toBe('com.anthropic.claudecode');
    const document = readAdminDocument(
      'plist',
      found({ model: 'a', permissions: { deny: ['Read(./.env)'] } }),
    );
    expect(document.settings.permissions?.deny).toEqual(['Read(./.env)']);
  });
});

spec(`${STORES}.Windows HKLM registry`, () => {
  test('a value named Settings under HKLM\\SOFTWARE\\Policies\\ClaudeCode holds the JSON', () => {
    expect(REGISTRY_VALUE).toEqual({
      name: 'Settings',
      types: ['REG_SZ', 'REG_EXPAND_SZ'],
      key: 'SOFTWARE\\Policies\\ClaudeCode',
    });
    expect(registryPath('HKLM')).toBe('HKLM\\SOFTWARE\\Policies\\ClaudeCode\\Settings');
    expect(readAdminDocument('hklm', found('{"model":"a"}')).settings.model).toBe('a');
  });
});

spec(`${STORES}.Windows HKCU registry`, () => {
  test('the same Settings value under HKCU\\SOFTWARE\\Policies\\ClaudeCode', () => {
    expect(registryPath('HKCU')).toBe('HKCU\\SOFTWARE\\Policies\\ClaudeCode\\Settings');
    expect(readAdminDocument('hkcu', found('{"model":"a"}')).settings.model).toBe('a');
  });
});

spec(`${STORES}.File-based`, () => {
  test('managed-settings.json, managed-settings.d/ and managed-mcp.json sit in the system directory of each OS', () => {
    expect(managedFilePaths('macos')).toEqual({
      dir: '/Library/Application Support/ClaudeCode',
      settings: '/Library/Application Support/ClaudeCode/managed-settings.json',
      dropIns: '/Library/Application Support/ClaudeCode/managed-settings.d',
      mcp: '/Library/Application Support/ClaudeCode/managed-mcp.json',
    });
    expect(managedFilePaths('linux').dropIns).toBe('/etc/claude-code/managed-settings.d');
    expect(managedFilePaths('windows').mcp).toBe('C:\\Program Files\\ClaudeCode\\managed-mcp.json');
  });

  test('a deployed symbolic link is read through, and the policy applies whatever the link leads to', () => {
    const outside = symlinkVerdict({
      path: '/etc/claude-code/managed-settings.json',
      targetInside: false,
    });
    expect(outside.applies).toBe(true);
    expect(outside.warning?.message).toContain('/etc/claude-code/managed-settings.json');
    const unknown = symlinkVerdict({
      path: '/etc/claude-code/managed-settings.json',
      targetInside: undefined,
    });
    expect(unknown.applies).toBe(true);
    expect(unknown.warning).toBeDefined();
  });

  test('a link whose target is inside the system directory raises no warning', () => {
    expect(
      symlinkVerdict({ path: '/etc/claude-code/managed-settings.json', targetInside: true })
        .warning,
    ).toBeUndefined();
  });

  test('the drop-in directory merges with the file', () => {
    const merged = readFileDocument({
      base: { value: { model: 'a' } },
      dropIns: { files: [{ name: '10-x.json', read: { value: { cleanupPeriodDays: 3 } } }] },
    });
    expect(merged.settings).toMatchObject({ model: 'a', cleanupPeriodDays: 3 });
  });
});

spec(`${STORES}.Server-managed`, () => {
  const cached = { model: 'cached', cleanupPeriodDays: 3 } as const;

  test('the local cache is applied at startup and replaced by each successful fetch', () => {
    expect(cacheAfterFetch(cached, { ok: true, settings: { model: 'fresh' } })).toEqual({
      model: 'fresh',
    });
  });

  test('a fetch that delivers no policy replaces the cache with none', () => {
    expect(cacheAfterFetch(cached, { ok: true, settings: undefined })).toBeUndefined();
  });

  test('a failed fetch leaves the cache applying', () => {
    expect(cacheAfterFetch(cached, { ok: false })).toEqual(cached);
  });
});

spec('policy.managed.What a developer can change.The server-managed cache', () => {
  test('an edit to the cache lasts only until the next successful fetch', () => {
    const edited = { model: 'edited' };
    expect(cacheAfterFetch(edited, { ok: false })).toEqual(edited);
    expect(cacheAfterFetch(edited, { ok: true, settings: { model: 'server' } })).toEqual({
      model: 'server',
    });
  });
});

/**
 * `editOfManagedSource` states who can change a source as a table, not a behavior the kit runs on
 * anything: the docs say a local administrator can edit the managed source and that the server cache
 * edit lasts until the next fetch, and are silent on the HKCU registry (spec/judgments.md).
 */
describe('what a developer can change, as the kit tabulates it (judgment)', () => {
  test('a local administrator can edit the managed file or MDM profile itself; anyone else cannot', () => {
    for (const mechanism of ['file', 'mdm'] as const) {
      expect(editOfManagedSource(mechanism, true)).toBe('stays');
      expect(editOfManagedSource(mechanism, false)).toBe('refused');
    }
  });

  test('the user-writable HKCU registry needs no admin rights', () => {
    expect(editOfManagedSource('hkcu', false)).toBe('stays');
  });

  test('an edit to the server-managed cache is replaced by the next successful fetch', () => {
    expect(editOfManagedSource('serverManaged', true)).toBe('until-next-fetch');
    expect(editOfManagedSource('serverManaged', false)).toBe('until-next-fetch');
  });
});

spec('policy.org.Which managed source applies on a machine', () => {
  const plugins = { enabledPlugins: { 'formatter@org': true } };

  test('by default only one source applies: the first that delivers a policy key, server, MDM, then file', () => {
    expect(
      compose({ remote: { model: 'a' }, plist: { model: 'b' }, file: { model: 'c' } }).used,
    ).toEqual(['remote']);
    expect(compose({ plist: { model: 'b' }, file: { model: 'c' } }).used).toEqual(['plist']);
    expect(compose({ file: { model: 'c' } }).used).toEqual(['file']);
  });

  test('server-managed settings with even one unrelated policy key hide the plugin keys of an MDM policy or file', () => {
    expect(policyOf({ remote: { model: 'a' }, file: plugins }).enabledPlugins).toBeUndefined();
    expect(policyOf({ remote: { model: 'a' }, plist: plugins }).enabledPlugins).toBeUndefined();
  });

  test('apart from the keys read from every source', () => {
    expect(
      policyOf({ remote: { model: 'a' }, file: { allowAllClaudeAiMcps: true } })
        .allowAllClaudeAiMcps,
    ).toBe(true);
  });

  test('managedSourcesBehavior merge applies every source instead', () => {
    const settings = policyOf({
      remote: { managedSourcesBehavior: 'merge', model: 'a' },
      file: plugins,
    });
    expect(settings.enabledPlugins).toEqual({ 'formatter@org': true });
  });
});

describe('where the key is delivered', () => {
  test('an MDM policy or file lacking a policy key falls through to the next source', () => {
    expect(
      compose({ plist: { wslInheritsWindowsSettings: true }, file: { model: 'c' } }).used,
    ).toEqual(['file']);
  });
});
