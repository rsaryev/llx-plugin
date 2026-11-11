/**
 * Judgments of the registry and the command sources (spec/judgments.md): where settings-reference.md
 * `extraKnownMarketplaces`, plugins/org.md and plugins/host-marketplace.md are silent. Tested outside
 * `spec()`, so none of it counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { github } from '../../support/marketplace-sources.ts';
import { commandSourcesOf, inFolder, plan } from '../../support/marketplace-registry.ts';

const acme = { source: github('acme-corp/claude-plugins') };
const allowlist = { strictKnownMarketplaces: [github('acme-corp/plugins')] };
const inline = (plugins: readonly unknown[]) => ({
  extraKnownMarketplaces: { team: { source: { source: 'settings', name: 'team', plugins } } },
});

describe('what names a marketplace', () => {
  test('a policy-list source kind or a kind nobody lists is not a marketplace: invalid, with an error', () => {
    for (const source of [
      { source: 'hostPattern', hostPattern: 'git.example.com' },
      { source: 'pathPattern', pathPattern: '.*' },
      { source: 'skills-dir' },
      { source: 'ftp', url: 'ftp://x' },
    ]) {
      const [only] = plan([['user', { extraKnownMarketplaces: { m: { source } } }]]);
      expect(only?.status).toBe('invalid');
      expect(only?.issues[0]?.severity).toBe('error');
    }
  });

  test('an inline plugin whose source is `command` is external; `unsupported` is not', () => {
    const command = { name: 'c', source: { source: 'command', command: 'my-tool path' } };
    const unsupported = { name: 'u', source: { source: 'unsupported' } };
    expect(plan([['user', inline([command])]])[0]?.status).toBe('register');
    expect(plan([['user', inline([unsupported])]])[0]?.status).toBe('invalid');
  });

  test("an `npm` marketplace source registers: the docs' list omits it and only the SDK types it", () => {
    const npm = {
      extraKnownMarketplaces: { m: { source: { source: 'npm', package: '@acme/m' } } },
    };
    expect(plan([['user', npm]])[0]?.status).toBe('register');
  });

  test('a settings source with no plugin list registers; a plugin that is not an object makes it invalid, never a crash', () => {
    const noList = {
      extraKnownMarketplaces: { team: { source: { source: 'settings', name: 'team' } } },
    };
    expect(plan([['user', noList]])[0]?.status).toBe('register');
    expect(plan([['user', inline(['plain text'])]])[0]?.status).toBe('invalid');
  });

  test('a marketplace refused for its inline plugins registers nothing, so a lower entry is shadowed', () => {
    const registrations = plan([
      ['project', inline([{ name: 'e', source: './e' }])],
      ['user', { extraKnownMarketplaces: { team: acme } }],
    ]);
    expect(registrations.map((r) => r.status)).toEqual(['invalid', 'shadowed']);
  });
});

describe('the allowlist and blocklist', () => {
  test('apply to an entry of every file, not only a managed one: the registry plans no clone the policy forbids', () => {
    const registrations = plan([
      ['managed', allowlist],
      ['user', { extraKnownMarketplaces: { m: acme } }],
    ]);
    expect(registrations.map((r) => [r.from, r.status])).toEqual([['user', 'refusedByAllowlist']]);
  });

  test('a blocked source is refused like a source outside the allowlist', () => {
    const registrations = plan([
      [
        'managed',
        {
          blockedMarketplaces: [github('acme-corp/claude-plugins')],
          extraKnownMarketplaces: { m: acme },
        },
      ],
    ]);
    expect(registrations[0]?.status).toBe('refusedByAllowlist');
  });

  test('a refusing policy does not fall through to a lower entry of the same name', () => {
    const registrations = plan([
      [
        'managed',
        { ...allowlist, extraKnownMarketplaces: { m: { source: github('someone/else') } } },
      ],
      ['user', { extraKnownMarketplaces: { m: { source: github('acme-corp/plugins') } } }],
    ]);
    expect(registrations.map((r) => [r.from, r.status])).toEqual([
      ['managed', 'refusedByAllowlist'],
      ['user', 'shadowed'],
    ]);
  });
});

describe('workspace trust of a --add-dir directory', () => {
  test('the host is asked, as for a project file; the docs name only the repository files', () => {
    const entries = { extraKnownMarketplaces: { m: acme } };
    expect(plan([['addDir', entries]], { isFolderTrusted: () => false })[0]?.status).toBe(
      'ignoredUntrusted',
    );
    expect(
      plan([['addDir', entries]], { isFolderTrusted: (scope) => scope === 'addDir' })[0]?.status,
    ).toBe('register');
  });
});

describe('the official marketplace implied by enabledPlugins', () => {
  const OFFICIAL = 'claude-plugins-official';

  test('is declared from the highest file that turns one of its plugins on', () => {
    const registrations = plan([
      ['user', { enabledPlugins: { [`a@${OFFICIAL}`]: true } }],
      inFolder({ enabledPlugins: { [`b@${OFFICIAL}`]: true } }),
    ]);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.from).toBe('project');
  });

  test('an explicit entry that is only ignored for an untrusted folder does not stop the implied one', () => {
    const registrations = plan(
      [
        ['managed', { enabledPlugins: { [`a@${OFFICIAL}`]: true } }],
        inFolder({ extraKnownMarketplaces: { [OFFICIAL]: acme } }),
      ],
      { isFolderTrusted: () => false },
    );
    expect(registrations.map((r) => [r.from, r.status, r.implied])).toEqual([
      ['project', 'ignoredUntrusted', false],
      ['managed', 'register', true],
    ]);
  });
});

describe('command-sourced plugins', () => {
  test('the verdict does not read enabledPlugins, so a force-enabled managed plugin has no exception', () => {
    const blocked = { allowManagedHooksOnly: true };
    const forced = { ...blocked, enabledPlugins: { 'formatter@acme-tools': true } };
    expect(commandSourcesOf(['managed', forced]).pluginSource).toEqual(
      commandSourcesOf(['managed', blocked]).pluginSource,
    );
    expect(commandSourcesOf(['managed', forced]).pluginSource.run).toBe(false);
  });
});

const autoUpdating = (autoUpdate?: boolean) => ({
  extraKnownMarketplaces: {
    m: { source: github('a/b'), ...(autoUpdate === undefined ? {} : { autoUpdate }) },
  },
});

describe('which settings file set `autoUpdate` (judgment: the winning entry replaces lower ones whole)', () => {
  test('the winning entry that sets it names its file', () => {
    const [winner] = plan([
      ['local', autoUpdating(true)],
      ['user', autoUpdating(false)],
    ]);
    expect(winner?.autoUpdateFrom).toEqual({ scope: 'local', position: 0 });
    expect(winner?.entry.autoUpdate).toBe(true);
  });

  test('a winning entry without it is the default: no file, though a lower entry sets it', () => {
    const [winner, lower] = plan([
      ['project', autoUpdating()],
      ['user', autoUpdating(true)],
    ]);
    expect(winner?.autoUpdateFrom).toBeUndefined();
    expect(winner?.entry.autoUpdate).toBe(false);
    expect(lower?.autoUpdateFrom).toEqual({ scope: 'user', position: 1 });
  });
});
