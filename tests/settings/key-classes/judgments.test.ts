/**
 * The judgments of the key classes (spec/judgments.md): behaviour the managed-settings.md and
 * settings-reference.md entries leave open. Not under spec(): a judgment never counts as
 * compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { gatewaySignInRefused } from '../../../src/settings/managed/index.ts';
import { compose } from '../../support/managed.ts';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';

const managed = (raw: unknown) => viewOf(['managed', raw]);

describe('MCP server entries', () => {
  test('an entry with none of the three fields, or a field of another type, is stripped', () => {
    const raw = {
      allowedMcpServers: [
        { serverUrl: 'https://a/*' },
        {},
        { serverUrl: 3 },
        { serverCommand: ['x', 1] },
      ],
    };
    expect(managed(raw).get('allowedMcpServers')).toEqual([{ serverUrl: 'https://a/*' }]);
  });
});

describe('forceLoginOrgUUID', () => {
  test('the empty list stands for "no organization is permitted", also for a list with a non-text entry', () => {
    expect(plain(managed({ forceLoginOrgUUID: [1, 2] }).get('forceLoginOrgUUID'))).toEqual([]);
    expect(plain(managed({ forceLoginOrgUUID: ['a', 2] }).get('forceLoginOrgUUID'))).toEqual([]);
  });

  test('outside the policy tier a non-text entry is stripped and the rest stays', () => {
    expect(
      plain(viewOf(['user', { forceLoginOrgUUID: ['a', 2] }]).get('forceLoginOrgUUID')),
    ).toEqual(['a']);
  });
});

describe('the parent settings carry', () => {
  test('allowedMcpServers, deniedMcpServers, forceLoginOrgUUID and allowedProviders, and not deniedModels or availableModelsMatch', () => {
    const raw = {
      allowedMcpServers: [{ serverName: 'a' }],
      deniedMcpServers: [{ serverName: 'b' }],
      forceLoginOrgUUID: 'org',
      allowedProviders: ['bedrock'],
      deniedModels: ['opus'],
      availableModelsMatch: 'exact',
    };
    const layer = viewOf(['parent', raw]).layers[0];
    expect(Object.keys(layer?.settings ?? {}).toSorted()).toEqual([
      'allowedMcpServers',
      'allowedProviders',
      'deniedMcpServers',
      'forceLoginOrgUUID',
    ]);
  });
});

describe('gatewayInternalNetworks, the empty list', () => {
  const refused = (networks: unknown) =>
    gatewaySignInRefused(compose({ file: { gatewayInternalNetworks: networks } }).layer);

  test('an empty list is a valid list of at most four blocks, so it refuses nothing', () => {
    expect(refused([])).toBe(false);
  });

  test('the blocks next to the private ranges are not private space', () => {
    for (const block of ['172.15.0.0/16', '172.32.0.0/16', '192.169.0.0/16', '11.0.0.0/8']) {
      expect(refused([block])).toBe(false);
    }
  });
});

describe('sandbox stances not named by the docs', () => {
  const sandbox = (block: unknown) => managed({ sandbox: block }).get('sandbox');

  test('the restrictions that turn on read true, the loosening switches read false', () => {
    const s = sandbox({
      network: { strictAllowlist: 1, allowAllUnixSockets: 1 },
      filesystem: { allowManagedReadPathsOnly: 1, disabled: 1 },
      credentials: { allowPlaintextInject: 1 },
      autoAllowBashIfSandboxed: 1,
      allowAppleEvents: 1,
    });
    expect(s?.network?.strictAllowlist).toBe(true);
    expect(s?.filesystem?.allowManagedReadPathsOnly).toBe(true);
    expect(s?.network?.allowAllUnixSockets).toBe(false);
    expect(s?.filesystem?.disabled).toBe(false);
    expect(s?.credentials?.allowPlaintextInject).toBe(false);
    expect(s?.autoAllowBashIfSandboxed).toBe(false);
    expect(s?.allowAppleEvents).toBe(false);
  });

  test('a field that is neither a Boolean nor a list is kept as written', () => {
    expect(
      plain(sandbox({ network: { httpProxyPort: 'x' }, bwrapPath: 5 })?.network?.httpProxyPort),
    ).toBe('x');
  });
});

describe('sandbox lists', () => {
  const block = (raw: unknown) => viewOf(['managed', { sandbox: raw }]).get('sandbox');

  test('an empty list is a valid list: kept without a warning', () => {
    const raw = { excludedCommands: [], network: { allowedDomains: [], deniedDomains: [] } };
    const sandbox = block(raw);
    expect(sandbox?.excludedCommands).toEqual([]);
    expect(sandbox?.network?.allowedDomains).toEqual([]);
    expect(messagesOf('managed', { sandbox: raw })).toEqual([]);
  });

  test('a list whose every entry is invalid does not apply, with a warning', () => {
    expect(messagesOf('managed', { sandbox: { excludedCommands: [1] } })).toEqual([
      '"sandbox.excludedCommands" is not a list with a valid entry; the list does not apply',
    ]);
  });
});

describe('credential entry fields', () => {
  const files = (entry: unknown) =>
    managed({ sandbox: { credentials: { files: [entry] } } }).get('sandbox')?.credentials?.files;

  test('each optional field is checked, and a degraded entry keeps its identity and deny only', () => {
    const bad = [
      { decode: 'base64' },
      { onExtractNoMatch: 'ignore' },
      { maskClaims: [1] },
      { injectHosts: 'x' },
      { maskDuplicates: 'yes' },
      { extract: '(' },
    ];
    for (const field of bad) {
      expect(files({ path: '~/.x', mode: 'mask', ...field })).toEqual([
        { path: '~/.x', mode: 'deny' },
      ]);
    }
  });

  test('a field the docs do not list degrades a mask entry: the kit cannot tell what it would loosen', () => {
    expect(files({ path: '~/.x', mode: 'mask', futureField: 1 })).toEqual([
      { path: '~/.x', mode: 'deny' },
    ]);
  });

  test('maskDuplicates is a field of files only: the table for environment variables does not list it', () => {
    const envVars = (entry: unknown) =>
      managed({ sandbox: { credentials: { envVars: [entry] } } }).get('sandbox')?.credentials
        ?.envVars;
    expect(envVars({ name: 'T', mode: 'mask', maskDuplicates: true })).toEqual([
      { name: 'T', mode: 'deny' },
    ]);
  });

  test('a deny entry accepts mask fields and ignores them: it is kept as written, without a warning', () => {
    const entry = { path: '~/.x', mode: 'deny', extract: 'no group', futureField: 1 };
    expect(plain(files(entry))).toEqual([entry]);
    expect(messagesOf('managed', { sandbox: { credentials: { files: [entry] } } })).toEqual([]);
  });

  test('a mask entry with valid fields is kept', () => {
    const entry = {
      path: '~/.x',
      mode: 'mask',
      decode: 'jwt',
      onExtractNoMatch: 'warn',
      maskClaims: ['sub'],
      maskDuplicates: true,
      injectHosts: ['a.com'],
      extract: '"t":"(.+)"',
    };
    expect(plain(files(entry))).toEqual([entry]);
  });
});

describe('the worktree and attribution blocks in a managed source', () => {
  const worktree = (raw: unknown) => managed({ worktree: raw }).get('worktree');
  const attribution = (raw: unknown) => managed({ attribution: raw }).get('attribution');

  test('an invalid worktree field is dropped with a warning and the rest of the block stays', () => {
    const raw = { baseRef: 'sideways', symlinkDirectories: ['node_modules'], sparsePaths: [1] };
    expect(plain(worktree(raw))).toEqual({ symlinkDirectories: ['node_modules'] });
    expect(messagesOf('managed', { worktree: raw })).toEqual([
      '"worktree.baseRef" is invalid; the field is dropped',
      '"worktree.sparsePaths" is invalid; the field is dropped',
    ]);
  });

  test('an invalid worktree.bgIsolation reads as worktree, its restrictive default', () => {
    expect(plain(worktree({ bgIsolation: 'sometimes' }))).toEqual({ bgIsolation: 'worktree' });
    expect(messagesOf('managed', { worktree: { bgIsolation: 3 } })).toEqual([
      '"worktree.bgIsolation" was present but invalid; it is treated as "worktree"',
    ]);
  });

  test('an invalid attribution field is dropped with a warning and the rest of the block stays', () => {
    const raw = { commit: 5, pr: 'text', sessionUrl: 'no' };
    expect(plain(attribution(raw))).toEqual({ pr: 'text' });
    expect(messagesOf('managed', { attribution: raw })).toEqual([
      '"attribution.commit" is invalid; the field is dropped',
      '"attribution.sessionUrl" is invalid; the field is dropped',
    ]);
  });

  test('valid blocks, a field of a newer version and the Boolean form of attribution stay as written', () => {
    const block = { baseRef: 'head', bgIsolation: 'none', future: [1] };
    expect(plain(worktree(block))).toEqual(block);
    expect(plain(attribution({ commit: '', pr: '', sessionUrl: false, future: 1 }))).toEqual({
      commit: '',
      pr: '',
      sessionUrl: false,
      future: 1,
    });
    expect(attribution(false)).toBe(false);
    expect(messagesOf('managed', { worktree: block, attribution: false })).toEqual([]);
  });

  test('a value that is no block is dropped whole, in any source', () => {
    expect(worktree('head')).toBeUndefined();
    expect(attribution('none')).toBeUndefined();
    expect(viewOf(['user', { worktree: 5 }]).get('worktree')).toBeUndefined();
  });

  test('a user file drops invalid fields rather than failing closed', () => {
    const raw = { worktree: { baseRef: 'sideways' }, attribution: { commit: 5 } };
    const view = viewOf(['user', raw]);
    expect(plain(view.get('worktree'))).toEqual({});
    expect(plain(view.get('attribution'))).toEqual({});
  });
});

describe('skipDangerousModePermissionPrompt', () => {
  test('its restrictive value is false: the dialog before bypassPermissions stays', () => {
    expect(
      viewOf(['managed', { skipDangerousModePermissionPrompt: 'x' }]).get(
        'skipDangerousModePermissionPrompt',
      ),
    ).toBe(false);
  });
});

describe('the permissions block in a managed source', () => {
  test('a deny list that lost an entry only drops that entry, and withholds nothing', () => {
    const raw = { permissions: { deny: ['Bash(rm *)', 5], allow: ['Bash(ls)'] } };
    expect(managed(raw).get('permissions')).toEqual({ deny: ['Bash(rm *)'], allow: ['Bash(ls)'] });
  });
});

describe('the autoMode and sandbox managed-only scopes', () => {
  test('autoMode is read from user, managed and --settings files only', () => {
    for (const scope of ['user', 'managed', 'flag'] as const) {
      expect(viewOf([scope, { autoMode: { allow: ['a'] } }]).get('autoMode')).toEqual({
        allow: ['a'],
      });
    }
    for (const scope of ['project', 'local'] as const) {
      expect(viewOf([scope, { autoMode: { allow: ['a'] } }]).get('autoMode')).toBeUndefined();
    }
  });

  test('the two managed-only sandbox keys are dropped with a warning from a user file, the rest of the block stays', () => {
    const raw = {
      sandbox: {
        network: { allowManagedDomainsOnly: true, allowedDomains: ['a.com'] },
        filesystem: { allowManagedReadPathsOnly: true },
      },
    };
    expect(messagesOf('user', raw).toSorted()).toEqual([
      '"sandbox.filesystem.allowManagedReadPathsOnly" is not read from user settings; the key is ignored',
      '"sandbox.network.allowManagedDomainsOnly" is not read from user settings; the key is ignored',
    ]);
    // A block the removal empties is no block (`withValueAt`).
    expect(viewOf(['user', raw]).get('sandbox')).toEqual({
      network: { allowedDomains: ['a.com'] },
    });
  });
});

describe('null on a general key', () => {
  test('removes the key from every source', () => {
    expect(
      viewOf(['user', { model: 'a', permissions: null, crossSessionInbound: null }]).merged(),
    ).toEqual({ model: 'a' });
  });
});

describe('the control keys', () => {
  test('keep their value as written in the managed layer', () => {
    const raw = {
      managedSourcesBehavior: 'sometimes',
      parentSettingsBehavior: 3,
      wslInheritsWindowsSettings: 'yes',
      policyHelper: 'x',
    };
    expect(plain(managed(raw).layers[0]?.settings)).toEqual(raw);
  });
});
