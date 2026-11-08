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
  test('a list that loses every entry permits no organization', () => {
    expect(plain(managed({ forceLoginOrgUUID: [1, 2] }).get('forceLoginOrgUUID'))).toEqual([]);
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

describe('gatewayInternalNetworks and private space', () => {
  const refused = (networks: unknown) =>
    gatewaySignInRefused(compose({ file: { gatewayInternalNetworks: networks } }).layer);

  test('RFC 1918 is private space, the next block outside it is not', () => {
    for (const block of [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '172.31.0.0/16',
      '192.168.1.0/24',
    ]) {
      expect(refused([block])).toBe(true);
    }
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
    expect(messagesOf('user', raw)).toEqual([
      '"sandbox.network.allowManagedDomainsOnly" is not read from user settings; the key is ignored',
      '"sandbox.filesystem.allowManagedReadPathsOnly" is not read from user settings; the key is ignored',
    ]);
    expect(viewOf(['user', raw]).get('sandbox')).toEqual({
      network: { allowedDomains: ['a.com'] },
      filesystem: {},
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
