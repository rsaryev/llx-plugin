/**
 * managed-settings.md § How Claude Code combines managed sources ("merge"), § Compose every managed
 * source (the table, one row per kind of key); settings-reference.md, `managedSourcesBehavior` (the
 * same table, the keys of each row and the conditions it adds).
 */
import { describe, expect, test } from 'bun:test';
import { compose, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const COMBINES = 'settingsMerge.managed.How Claude Code combines managed sources';
const COMPOSE = 'settingsMerge.managed.Compose every managed source';
const MERGE = { managedSourcesBehavior: 'merge' } as const;

/** The remote source opts in; the file below it is the one being combined. */
const merged = (remote: object, file: object) =>
  policyOf({ remote: { ...MERGE, ...remote }, file });

spec(`${COMBINES}."merge"`, () => {
  test('every admin source that delivers a policy key contributes to one policy', () => {
    const composed = compose({
      remote: { ...MERGE, model: 'sonnet' },
      plist: { cleanupPeriodDays: 7 },
      file: { permissions: { allow: ['Bash(ls)'] } },
    });
    expect(composed.behavior).toBe('merge');
    expect(composed.used).toEqual(['remote', 'plist', 'file']);
    expect(composed.skipped).toEqual([]);
    expect(composed.layer.settings.model).toBe('sonnet');
    expect(composed.layer.settings.cleanupPeriodDays).toBe(7);
    expect(composed.layer.settings.permissions?.allow).toEqual(['Bash(ls)']);
  });

  test('/status lists the merged sources and ends the list with ", merged"', () => {
    const composed = compose({ remote: { ...MERGE, model: 'a' }, file: { cleanupPeriodDays: 7 } });
    expect(composed.settingSources).toBe('Enterprise managed settings (remote + file, merged)');
  });

  test('a source that delivers no policy key does not take part', () => {
    const composed = compose({
      remote: { ...MERGE, model: 'a' },
      file: { wslInheritsWindowsSettings: true },
    });
    expect(composed.used).toEqual(['remote']);
  });

  test('the key is read from the highest-ranked source that carries it or a policy key', () => {
    expect(compose({ remote: MERGE, file: { model: 'b' } }).behavior).toBe('merge');
    expect(compose({ remote: { model: 'a' }, file: MERGE }).behavior).toBe('first-wins');
    expect(
      compose({ plist: { cleanupPeriodDays: 1 }, file: { ...MERGE, model: 'b' } }).behavior,
    ).toBe('first-wins');
  });

  test('a machine without server-managed settings needs the key in its MDM profile', () => {
    expect(
      compose({ plist: { ...MERGE, model: 'a' }, file: { cleanupPeriodDays: 2 } }).used,
    ).toEqual(['plist', 'file']);
  });

  test('"merge" in the managed file, the lowest admin source, has nothing below it to combine with', () => {
    const composed = compose({ file: { ...MERGE, model: 'a' }, hkcu: { cleanupPeriodDays: 2 } });
    expect(composed.used).toEqual(['file']);
  });

  test('a value other than "merge" is the default', () => {
    expect(
      compose({ remote: { managedSourcesBehavior: 'bogus', model: 'a' }, file: { model: 'b' } })
        .behavior,
    ).toBe('first-wins');
  });
});

spec(`${COMPOSE}.Lists`, () => {
  test('permissions.allow, sandbox.network.allowedDomains, deniedMcpServers and deniedModels combine from every source', () => {
    const settings = merged(
      {
        permissions: { allow: ['Bash(a)'] },
        sandbox: { network: { allowedDomains: ['one.example'] } },
        deniedMcpServers: [{ serverName: 'x' }],
        deniedModels: ['claude-old'],
      },
      {
        permissions: { allow: ['Bash(b)', 'Bash(a)'] },
        sandbox: { network: { allowedDomains: ['two.example'] } },
        deniedMcpServers: [{ serverName: 'y' }],
        deniedModels: ['claude-older'],
      },
    );
    expect(settings.permissions?.allow).toEqual(['Bash(a)', 'Bash(b)']);
    expect(settings.sandbox?.network?.allowedDomains).toEqual(['one.example', 'two.example']);
    expect(settings.deniedMcpServers).toEqual([{ serverName: 'x' }, { serverName: 'y' }]);
    expect(settings.deniedModels).toEqual(['claude-old', 'claude-older']);
  });

  test('hooks of a lower source are added to the policy', () => {
    const hook = (command: string) => ({
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command }] }] },
    });
    const groups = merged(hook('remote.sh'), hook('file.sh')).hooks?.PreToolUse ?? [];
    expect(groups).toHaveLength(2);
  });

  test('without merge a lower list is left out', () => {
    const settings = policyOf({
      remote: { permissions: { allow: ['Bash(a)'] } },
      file: { permissions: { allow: ['Bash(b)'] } },
    });
    expect(settings.permissions?.allow).toEqual(['Bash(a)']);
  });
});

spec(`${COMPOSE}.Locks`, () => {
  test('the strictest value any source sets applies, whichever source holds it', () => {
    const settings = merged(
      { allowManagedHooksOnly: false, permissions: { disableBypassPermissionsMode: 'disable' } },
      { allowManagedHooksOnly: true, crossSessionInbound: 'refuse' },
    );
    expect(settings.allowManagedHooksOnly).toBe(true);
    expect(settings.permissions?.disableBypassPermissionsMode).toBe('disable');
    expect(settings.crossSessionInbound).toBe('refuse');
  });

  test('of two enum values the stricter applies', () => {
    expect(
      merged({ crossSessionInbound: 'hold' }, { crossSessionInbound: 'refuse' })
        .crossSessionInbound,
    ).toBe('refuse');
    expect(
      merged({ crossSessionInbound: 'refuse' }, { crossSessionInbound: 'hold' })
        .crossSessionInbound,
    ).toBe('refuse');
    expect(
      merged({ availableModelsMatch: 'prefix' }, { availableModelsMatch: 'exact' })
        .availableModelsMatch,
    ).toBe('exact');
  });

  test('a looser value applies only from the highest-ranked source', () => {
    expect(
      merged({ allowManagedHooksOnly: false }, { allowManagedHooksOnly: false })
        .allowManagedHooksOnly,
    ).toBe(false);
    expect(
      merged({ model: 'a' }, { allowManagedHooksOnly: false }).allowManagedHooksOnly,
    ).toBeUndefined();
    expect(merged({ crossSessionInbound: 'accept' }, { model: 'b' }).crossSessionInbound).toBe(
      'accept',
    );
    expect(
      merged({ model: 'a' }, { crossSessionInbound: 'accept' }).crossSessionInbound,
    ).toBeUndefined();
  });
});

spec(`${COMPOSE}.Restriction allowlists`, () => {
  test('the list is taken whole from the highest source that sets it, with no entries added from lower ones', () => {
    const settings = merged(
      { availableModels: ['opus'], strictKnownMarketplaces: [{ source: 'github', repo: 'a/b' }] },
      {
        availableModels: ['sonnet', 'haiku'],
        strictKnownMarketplaces: [{ source: 'github', repo: 'c/d' }],
      },
    );
    expect(settings.availableModels).toEqual(['opus']);
    expect(settings.strictKnownMarketplaces).toEqual([{ source: 'github', repo: 'a/b' }]);
  });

  test('the next source down supplies it when the highest does not set one', () => {
    const settings = merged(
      { model: 'a' },
      { availableModels: ['sonnet'], allowedChannelPlugins: [{ marketplace: 'm', plugin: 'p' }] },
    );
    expect(settings.availableModels).toEqual(['sonnet']);
    expect(settings.allowedChannelPlugins).toEqual([{ marketplace: 'm', plugin: 'p' }]);
  });

  test('allowedMcpServers and the fallbackModel chain are taken whole as well', () => {
    const settings = merged(
      { allowedMcpServers: [{ serverName: 'a' }], fallbackModel: ['opus'] },
      { allowedMcpServers: [{ serverName: 'b' }], fallbackModel: ['sonnet', 'haiku'] },
    );
    expect(settings.allowedMcpServers).toEqual([{ serverName: 'a' }]);
    expect(settings.fallbackModel).toEqual(['opus']);
  });
});

spec(`${COMPOSE}.Values taken whole`, () => {
  test('sandbox.ripgrep is not combined field by field with a lower source', () => {
    const settings = merged(
      { sandbox: { ripgrep: { command: '/usr/bin/rg' } } },
      { sandbox: { ripgrep: { command: '/opt/rg', args: ['--x'] } } },
    );
    expect(settings.sandbox?.ripgrep).toEqual({ command: '/usr/bin/rg' });
  });

  test('the next source down supplies it when the highest does not set it', () => {
    const settings = merged({ model: 'a' }, { sandbox: { ripgrep: { command: '/opt/rg' } } });
    expect(settings.sandbox?.ripgrep).toEqual({ command: '/opt/rg' });
  });
});

spec(`${COMPOSE}.Provided MCP servers`, () => {
  test('the server names combine from every source and the higher source wins a shared name whole', () => {
    const settings = merged(
      {
        managedMcpServers: {
          shared: { type: 'http', url: 'https://remote.example' },
          one: { type: 'http', url: 'https://one.example' },
        },
      },
      {
        managedMcpServers: {
          shared: { type: 'http', url: 'https://file.example', headers: { a: 'b' } },
          two: { type: 'http', url: 'https://two.example' },
        },
      },
    );
    expect(Object.keys(settings.managedMcpServers ?? {}).toSorted()).toEqual([
      'one',
      'shared',
      'two',
    ]);
    expect(settings.managedMcpServers?.shared).toEqual({
      type: 'http',
      url: 'https://remote.example',
    });
  });
});

spec(`${COMPOSE}.Every other key`, () => {
  test('the value comes from the highest-ranked source that sets it', () => {
    const settings = merged({ model: 'sonnet' }, { model: 'opus', cleanupPeriodDays: 7 });
    expect(settings.model).toBe('sonnet');
    expect(settings.cleanupPeriodDays).toBe(7);
  });
});

describe('keys read from the highest-priority source only', () => {
  test('a lower source value is ignored even when the highest source sets none', () => {
    const picker = { options: [{ model: 'opus', label: 'Opus' }] };
    const settings = merged(
      { model: 'a', permissions: { defaultMode: 'plan' } },
      {
        apiKeyHelper: '/bin/key',
        modelPicker: picker,
        permissions: { defaultMode: 'acceptEdits' },
      },
    );
    expect(settings.apiKeyHelper).toBeUndefined();
    expect(settings.modelPicker).toBeUndefined();
    expect(settings.permissions?.defaultMode).toBe('plan');
    expect(merged({ model: 'a' }, { model: 'b' }).model).toBe('a');
    expect(compose({ file: { modelPicker: picker } }).layer.settings.modelPicker).toEqual(picker);
  });

  test('the highest source supplies its own', () => {
    expect(merged({ apiKeyHelper: '/bin/top' }, { apiKeyHelper: '/bin/low' }).apiKeyHelper).toBe(
      '/bin/top',
    );
  });

  test('a lower source cannot set a defaultMode when the highest sets none', () => {
    expect(
      merged({ model: 'a' }, { permissions: { defaultMode: 'plan' } }).permissions?.defaultMode,
    ).toBeUndefined();
  });
});

spec(`${COMPOSE}.env`, () => {
  test('merges per variable across admin sources under merge as well', () => {
    const settings = merged({ env: { A: 'remote' } }, { env: { A: 'file', B: 'file' } });
    expect(settings.env).toEqual({ A: 'remote', B: 'file' });
  });
});
