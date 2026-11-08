/**
 * managed-settings.md § Invalid values inside `sandbox`: "Claude Code doesn't drop the whole block,
 * because it validates each field on its own", and the six cases the warning distinguishes.
 */
import { describe, expect, test } from 'bun:test';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const sandboxOf = (block: unknown) => viewOf(['managed', { sandbox: block }]).get('sandbox');
const messages = (block: unknown) => messagesOf('managed', { sandbox: block });

spec('policy.managed.Invalid values inside sandbox', () => {
  describe('a Boolean set to the quoted "true" or "false" counts as that Boolean, with a notice to drop the quotes', () => {
    test('both quoted forms', () => {
      const block = {
        enabled: 'true',
        allowUnsandboxedCommands: 'false',
        network: { allowManagedDomainsOnly: 'true' },
      };
      const sandbox = sandboxOf(block);
      expect(sandbox?.enabled).toBe(true);
      expect(sandbox?.allowUnsandboxedCommands).toBe(false);
      expect(sandbox?.network?.allowManagedDomainsOnly).toBe(true);
      expect(messages(block)).toHaveLength(3);
      expect(messages(block).every((message) => message.includes('drop the quotes'))).toBe(true);
    });
  });

  describe('failIfUnavailable is dropped rather than treated as true', () => {
    test('an invalid value leaves no value, so an unreadable value never stops sessions from starting', () => {
      expect(sandboxOf({ failIfUnavailable: 'sometimes', enabled: true })).toEqual({
        enabled: true,
      });
      expect(messages({ failIfUnavailable: 'sometimes' })).toHaveLength(1);
    });

    test('a valid value is kept', () => {
      expect(sandboxOf({ failIfUnavailable: false })?.failIfUnavailable).toBe(false);
    });
  });

  describe('every other invalid Boolean reads as the value that keeps the sandbox strictest', () => {
    test('a key that turns the sandbox or a restriction on counts as true', () => {
      const sandbox = sandboxOf({
        enabled: 1,
        network: { allowManagedDomainsOnly: null },
        filesystem: { allowManagedReadPathsOnly: 'yes' },
      });
      expect(sandbox?.enabled).toBe(true);
      expect(sandbox?.network?.allowManagedDomainsOnly).toBe(true);
      expect(sandbox?.filesystem?.allowManagedReadPathsOnly).toBe(true);
    });

    test('a key that loosens it counts as false', () => {
      const sandbox = sandboxOf({
        allowUnsandboxedCommands: 'always',
        network: { allowLocalBinding: [] },
        enableWeakerNestedSandbox: 2,
      });
      expect(sandbox?.allowUnsandboxedCommands).toBe(false);
      expect(sandbox?.network?.allowLocalBinding).toBe(false);
      expect(sandbox?.enableWeakerNestedSandbox).toBe(false);
    });

    test('the warning names the field and the value it counts as', () => {
      expect(messages({ enabled: 'maybe' })).toEqual([
        '"sandbox.enabled" was present but invalid; it is treated as true',
      ]);
      expect(messages({ allowUnsandboxedCommands: 'maybe' })).toEqual([
        '"sandbox.allowUnsandboxedCommands" was present but invalid; it is treated as false',
      ]);
    });
  });

  describe('in a list outside credentials an invalid entry is dropped and the rest of the list kept', () => {
    test('excludedCommands and network.allowedDomains', () => {
      const sandbox = sandboxOf({
        excludedCommands: ['docker', 5, 'git'],
        network: { allowedDomains: ['github.com', null, '*.npmjs.org'] },
      });
      expect(sandbox?.excludedCommands).toEqual(['docker', 'git']);
      expect(sandbox?.network?.allowedDomains).toEqual(['github.com', '*.npmjs.org']);
    });

    test('a list that is not an array, or has no valid entry, does not apply at all', () => {
      const sandbox = sandboxOf({
        excludedCommands: 'docker',
        network: { allowedDomains: [1, 2] },
      });
      expect(sandbox?.excludedCommands).toBeUndefined();
      expect(sandbox?.network?.allowedDomains).toBeUndefined();
    });
  });

  describe('while network.deniedDomains or an entry in it is invalid, network.allowedDomains is withheld', () => {
    test('an invalid entry in the deny list', () => {
      const block = { network: { deniedDomains: ['evil.com', 7], allowedDomains: ['github.com'] } };
      const network = sandboxOf(block)?.network;
      expect(network?.allowedDomains).toBeUndefined();
      expect(network?.deniedDomains).toEqual(['evil.com']);
      expect(
        messages(block).some((message) =>
          message.includes('"sandbox.network.allowedDomains" is withheld'),
        ),
      ).toBe(true);
    });

    test('a deny list that is no list', () => {
      expect(
        sandboxOf({ network: { deniedDomains: 'evil.com', allowedDomains: ['github.com'] } })
          ?.network?.allowedDomains,
      ).toBeUndefined();
    });

    test('a valid deny list withholds nothing', () => {
      expect(
        sandboxOf({ network: { deniedDomains: ['evil.com'], allowedDomains: ['github.com'] } })
          ?.network?.allowedDomains,
      ).toEqual(['github.com']);
    });
  });

  describe('while filesystem.denyRead, filesystem.denyWrite or an entry in either is invalid, allowRead and allowWrite are both withheld', () => {
    for (const deny of ['denyRead', 'denyWrite'] as const) {
      test(`an invalid ${deny}`, () => {
        const filesystem = sandboxOf({
          filesystem: { [deny]: ['/etc', 3], allowRead: ['/data'], allowWrite: ['/tmp'] },
        })?.filesystem;
        expect(filesystem?.allowRead).toBeUndefined();
        expect(filesystem?.allowWrite).toBeUndefined();
        expect(filesystem?.[deny]).toEqual(['/etc']);
      });
    }

    test('valid deny lists withhold nothing', () => {
      const filesystem = sandboxOf({
        filesystem: {
          denyRead: ['/etc'],
          denyWrite: ['/usr'],
          allowRead: ['/data'],
          allowWrite: ['/tmp'],
        },
      })?.filesystem;
      expect(filesystem?.allowRead).toEqual(['/data']);
      expect(filesystem?.allowWrite).toEqual(['/tmp']);
    });
  });

  test('a user file is not repaired this way: the block stays as written', () => {
    const block = {
      enabled: 'maybe',
      network: { deniedDomains: [7], allowedDomains: ['github.com'] },
    };
    expect(plain(viewOf(['user', { sandbox: block }]).get('sandbox'))).toEqual(block);
  });
});
