/**
 * managed-settings.md § Keys that fail closed (the `sandbox.credentials` row), settings-reference.md
 * § "Invalid credential entries in managed settings" and the two tables of mask fields (files and
 * environment variables), sandboxing.md § "Which settings can disable it" (the `filesystem.disabled`
 * pin).
 */
import { describe, expect, test } from 'bun:test';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const ID = 'policy.managed.Keys that fail closed';

spec(`${ID}.sandbox.credentials`, () => {
  const credentials = (raw: unknown) =>
    viewOf(['managed', { sandbox: { credentials: raw } }]).get('sandbox')?.credentials;

  test('a recoverable invalid entry is degraded to mode deny with a warning', () => {
    const raw = { files: [{ path: '~/.aws/credentials', mode: 'mask', extract: 'no group here' }] };
    expect(credentials(raw)?.files).toEqual([{ path: '~/.aws/credentials', mode: 'deny' }]);
    expect(messagesOf('managed', { sandbox: { credentials: raw } })).toHaveLength(1);
  });

  test('an unrecoverable entry, an unknown mode or an invalid name, is stripped', () => {
    const raw = {
      envVars: [
        { name: 'TOKEN', mode: 'hide' },
        { name: '', mode: 'deny' },
        { mode: 'deny' },
        { name: 'GITHUB_TOKEN', mode: 'deny' },
      ],
    };
    expect(credentials(raw)?.envVars).toEqual([{ name: 'GITHUB_TOKEN', mode: 'deny' }]);
    expect(messagesOf('managed', { sandbox: { credentials: raw } })).toHaveLength(3);
  });

  test('valid entries stay enforced as written', () => {
    const files = [
      { path: '~/.aws/credentials', mode: 'deny' },
      {
        path: '~/.config/gh/hosts.yml',
        mode: 'mask',
        injectHosts: ['api.github.com'],
        extract: 'token: (.+)',
      },
    ];
    expect(plain(credentials({ files })?.files)).toEqual(files);
    expect(messagesOf('managed', { sandbox: { credentials: { files } } })).toEqual([]);
  });

  describe('the name of an environment variable starts with a letter or underscore and holds letters, digits and underscores', () => {
    test('an invalid name is stripped with a warning', () => {
      for (const name of ['1-bad name', '1ABC', 'A-B', 'A B', 'A.B', 'ünï']) {
        const raw = { envVars: [{ name, mode: 'deny' }] };
        expect(credentials(raw)?.envVars).toEqual([]);
        expect(messagesOf('managed', { sandbox: { credentials: raw } })).toHaveLength(1);
      }
    });

    test('a valid name is kept', () => {
      const envVars = [
        { name: '_PRIVATE', mode: 'deny' },
        { name: 'NPM_TOKEN2', mode: 'deny' },
      ];
      expect(plain(credentials({ envVars })?.envVars)).toEqual(envVars);
    });
  });

  describe('the mask fields of an environment variable', () => {
    const envVar = (extra: Record<string, unknown>) =>
      credentials({ envVars: [{ name: 'TOKEN', mode: 'mask', ...extra }] })?.envVars;
    const DENIED = [{ name: 'TOKEN', mode: 'deny' as const }];

    test('extract and decode cannot be combined on the same entry', () => {
      expect(envVar({ extract: 'x=(.+)', decode: 'jwt' })).toEqual(DENIED);
    });

    test('with decode only onExtractNoMatch "warn" is accepted', () => {
      expect(envVar({ decode: 'jwt', onExtractNoMatch: 'deny' })).toEqual(DENIED);
      expect(envVar({ decode: 'jwt', onExtractNoMatch: 'error' })).toEqual(DENIED);
      const kept = { name: 'TOKEN', mode: 'mask', decode: 'jwt', onExtractNoMatch: 'warn' };
      expect(plain(envVar({ decode: 'jwt', onExtractNoMatch: 'warn' }))).toEqual([kept]);
    });

    test('without decode every onExtractNoMatch value is accepted', () => {
      for (const value of ['warn', 'deny', 'error']) {
        const entry = { name: 'TOKEN', mode: 'mask', extract: 'x=(.+)', onExtractNoMatch: value };
        expect(plain(envVar({ extract: 'x=(.+)', onExtractNoMatch: value }))).toEqual([entry]);
      }
    });

    test('maskClaims needs at least one claim and requires decode', () => {
      expect(envVar({ decode: 'jwt', maskClaims: [] })).toEqual(DENIED);
      expect(envVar({ maskClaims: ['sub'] })).toEqual(DENIED);
      const kept = { name: 'TOKEN', mode: 'mask', decode: 'jwt', maskClaims: ['sub'] };
      expect(plain(envVar({ decode: 'jwt', maskClaims: ['sub'] }))).toEqual([kept]);
    });
  });

  describe('the mask fields of a file differ from those of an environment variable', () => {
    const file = (extra: Record<string, unknown>) =>
      credentials({ files: [{ path: '~/.x', mode: 'mask', ...extra }] })?.files;

    test('extract and decode can be combined: decode checks each capture as a JWT', () => {
      const entry = { path: '~/.x', mode: 'mask', extract: 't=(.+)', decode: 'jwt' };
      expect(plain(file({ extract: 't=(.+)', decode: 'jwt' }))).toEqual([entry]);
    });

    test('with decode onExtractNoMatch deny and error are accepted', () => {
      for (const value of ['deny', 'error']) {
        const entry = { path: '~/.x', mode: 'mask', decode: 'jwt', onExtractNoMatch: value };
        expect(plain(file({ decode: 'jwt', onExtractNoMatch: value }))).toEqual([entry]);
      }
    });

    test('maskClaims still needs at least one claim and requires decode', () => {
      const denied = [{ path: '~/.x', mode: 'deny' as const }];
      expect(file({ decode: 'jwt', maskClaims: [] })).toEqual(denied);
      expect(file({ maskClaims: ['sub'] })).toEqual(denied);
    });
  });

  describe('a degraded files entry says its read block is not enforced if managed settings turn filesystem isolation off', () => {
    test('a files entry carries the note', () => {
      const [message] = messagesOf('managed', {
        sandbox: { credentials: { files: [{ path: '~/.x', mode: 'mask', extract: 'no group' }] } },
      });
      expect(message).toContain('degraded to mode "deny"');
      expect(message).toContain(
        'Its read block is not enforced if managed settings turn filesystem isolation off',
      );
    });

    test('an envVars entry has no read block, so no note', () => {
      const [message] = messagesOf('managed', {
        sandbox: { credentials: { envVars: [{ name: 'T', mode: 'mask', extract: 'no group' }] } },
      });
      expect(message).toContain('degraded to mode "deny"');
      expect(message).not.toContain('filesystem isolation');
    });
  });

  describe('a deny entry, explicit or degraded, pins filesystem.disabled to managed settings', () => {
    const disabledWith = (
      managedBlock: unknown,
      ...above: readonly (readonly ['user' | 'project' | 'local' | 'flag', unknown])[]
    ) =>
      viewOf(['managed', { sandbox: managedBlock }], ...above).get('sandbox.filesystem.disabled');
    const userDisables = ['user', { sandbox: { filesystem: { disabled: true } } }] as const;

    test('an explicit deny entry: a user file cannot turn the isolation off', () => {
      const block = { credentials: { files: [{ path: '~/.aws', mode: 'deny' }] } };
      expect(disabledWith(block, userDisables)).toBeUndefined();
      expect(disabledWith({ ...block, filesystem: { disabled: true } }, userDisables)).toBe(true);
    });

    test('a degraded entry pins like an explicit deny entry', () => {
      const block = {
        credentials: { files: [{ path: '~/.x', mode: 'mask', extract: 'no group' }] },
      };
      expect(disabledWith(block, userDisables)).toBeUndefined();
    });

    test('a valid mask entry does not lock the key, and nor does an envVars deny entry', () => {
      const mask = { credentials: { files: [{ path: '~/.x', mode: 'mask' }] } };
      const envVars = { credentials: { envVars: [{ name: 'T', mode: 'deny' }] } };
      expect(disabledWith(mask, userDisables)).toBe(true);
      expect(disabledWith(envVars, userDisables)).toBe(true);
    });

    test('managed settings that configure sandbox.filesystem at all lock the key too', () => {
      expect(disabledWith({ filesystem: { denyRead: ['/etc'] } }, userDisables)).toBeUndefined();
    });

    test('a project or local file never sets the key, pinned or not', () => {
      const project = ['project', { sandbox: { filesystem: { disabled: true } } }] as const;
      const local = ['local', { sandbox: { filesystem: { disabled: true } } }] as const;
      expect(disabledWith({ enabled: true }, project, local)).toBeUndefined();
    });

    test('the merged settings carry the pinned value too', () => {
      const view = viewOf(
        ['managed', { sandbox: { credentials: { files: [{ path: '~/.a', mode: 'deny' }] } } }],
        ['user', { sandbox: { filesystem: { disabled: true } } }],
      );
      expect(view.merged().sandbox?.filesystem?.disabled).toBeUndefined();
    });
  });
});
