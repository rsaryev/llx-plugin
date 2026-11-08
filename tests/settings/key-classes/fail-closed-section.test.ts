/**
 * managed-settings.md § Keys that fail closed (the text before the table): a top-level key with a
 * single restrictive value reads as that value when a managed source sets it to something Claude
 * Code cannot read; the cases that do not fail closed; the per-field repair of the `permissions` and
 * `autoMode` blocks.
 */
import { describe, expect, test } from 'bun:test';
import { messagesOf, viewOf } from '../../support/key-classes.ts';
import { layerOf, plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const managed = (raw: unknown) => viewOf(['managed', raw]);
const said = (raw: unknown) => messagesOf('managed', raw);

spec('policy.managed.Keys that fail closed', () => {
  describe('a key with a single restrictive value reads as that value until fixed', () => {
    test('the report says the key was present but invalid and names the value it is treated as', () => {
      for (const key of [
        'allowManagedPermissionRulesOnly',
        'allowManagedHooksOnly',
        'disableCommandPluginSources',
      ] as const) {
        const raw = { [key]: 'definitely' };
        expect(managed(raw).get(key)).toBe(true);
        expect(said(raw)).toEqual([`"${key}" was present but invalid; it is treated as true`]);
      }
    });

    test('the same unreadable value in a user file is dropped, never enforced', () => {
      const raw = { disableSkillShellExecution: 'definitely' };
      expect(viewOf(['user', raw]).get('disableSkillShellExecution')).toBeUndefined();
    });
  });

  describe('these cases do not fail closed', () => {
    test('a null removes the key', () => {
      const raw = { allowManagedPermissionRulesOnly: null, allowManagedHooksOnly: null };
      expect(layerOf('managed', raw).settings).toEqual({});
      expect(said(raw)).toEqual([]);
    });

    test('an invalid disableAllHooks, even a quoted Boolean, is dropped with a warning', () => {
      for (const value of ['true', 'false', 'yes', 3]) {
        const raw = { disableAllHooks: value };
        expect(managed(raw).get('disableAllHooks')).toBeUndefined();
        expect(said(raw)).toHaveLength(1);
      }
    });

    test('for every other Boolean key the string "true" or "false" reads as that Boolean, with a notice to drop the quotes', () => {
      for (const key of [
        'allowManagedPermissionRulesOnly',
        'allowManagedHooksOnly',
        'disableSideloadFlags',
      ] as const) {
        for (const value of [true, false]) {
          const raw = { [key]: String(value) };
          expect(managed(raw).get(key)).toBe(value);
          expect(said(raw)).toEqual([`"${key}" is the text "${String(value)}": drop the quotes`]);
        }
      }
    });
  });

  describe('the permissions block is repaired per field', () => {
    test('a lock inside it, permissions.disableBypassPermissionsMode, reads as its restrictive value', () => {
      const raw = { permissions: { disableBypassPermissionsMode: 'yes', allow: ['Bash(ls)'] } };
      expect(managed(raw).get('permissions')).toEqual({
        disableBypassPermissionsMode: 'disable',
        allow: ['Bash(ls)'],
      });
      expect(said(raw)[0]).toContain(
        '"permissions.disableBypassPermissionsMode" was present but invalid',
      );
    });

    test('an invalid permissions.defaultMode reads as default', () => {
      const raw = { permissions: { defaultMode: 'yolo' } };
      expect(managed(raw).get('permissions')).toEqual({ defaultMode: 'default' });
      expect(managed(raw).get('permissions.defaultMode')).toBe('default');
    });

    test('a valid defaultMode and lock are kept as written', () => {
      const raw = { permissions: { defaultMode: 'plan', disableBypassPermissionsMode: 'disable' } };
      expect(plain(managed(raw).get('permissions'))).toEqual(raw.permissions);
      expect(said(raw)).toEqual([]);
    });

    describe('while a deny or ask list cannot be read at all, allow and additionalDirectories are withheld', () => {
      for (const list of ['deny', 'ask'] as const) {
        test(list, () => {
          const raw = {
            permissions: {
              [list]: 'Bash(rm *)',
              allow: ['Edit(~/x/**)'],
              additionalDirectories: ['../x'],
            },
          };
          expect(managed(raw).get('permissions')).toEqual({});
          const reported = said(raw);
          expect(
            reported.some(
              (m) =>
                m.includes('"permissions.allow" is withheld') &&
                m.includes(`"permissions.${list}"`),
            ),
          ).toBe(true);
          expect(
            reported.some(
              (m) =>
                m.includes('"permissions.additionalDirectories" is withheld') &&
                m.includes(`"permissions.${list}"`),
            ),
          ).toBe(true);
        });
      }

      test('the report names only the grants that were set', () => {
        const reported = said({ permissions: { deny: 7, allow: ['Bash(ls)'] } });
        expect(reported.filter((message) => message.includes('is withheld'))).toHaveLength(1);
      });

      test('a deny list that is readable withholds nothing', () => {
        const raw = {
          permissions: {
            deny: ['Bash(rm *)'],
            allow: ['Bash(ls)'],
            additionalDirectories: ['../x'],
          },
        };
        expect(managed(raw).get('permissions')).toEqual(raw.permissions);
      });

      test('a user file keeps its allow rules when its deny list cannot be read: the list is only ignored', () => {
        const raw = { permissions: { deny: 'Bash(rm *)', allow: ['Bash(ls)'] } };
        expect(viewOf(['user', raw]).get('permissions')).toEqual({ allow: ['Bash(ls)'] });
      });
    });
  });

  describe('the autoMode block is repaired per field', () => {
    for (const list of ['soft_deny', 'hard_deny'] as const) {
      test(`a ${list} list that cannot be read withholds allow and environment`, () => {
        const raw = {
          autoMode: {
            [list]: 'no network',
            allow: ['deploys to staging'],
            environment: ['repo acme/x'],
          },
        };
        expect(managed(raw).get('autoMode')).toEqual({});
        expect(
          said(raw).filter(
            (message) =>
              message.includes('is withheld') &&
              message.includes(`"autoMode.${list}" could not be read`),
          ),
        ).toHaveLength(2);
      });

      test(`a ${list} list that lost an invalid entry withholds them too and keeps its valid entries`, () => {
        const raw = { autoMode: { [list]: ['never deploy', 5], allow: ['a'], environment: ['b'] } };
        expect(managed(raw).get('autoMode')).toEqual({ [list]: ['never deploy'] });
        expect(said(raw).some((message) => message.includes('lost an invalid entry'))).toBe(true);
      });
    }

    test('readable lists keep allow and environment', () => {
      const raw = {
        autoMode: {
          soft_deny: ['$defaults', 'never run terraform apply'],
          allow: ['a'],
          environment: ['b'],
        },
      };
      expect(managed(raw).get('autoMode')).toEqual(raw.autoMode);
      expect(said(raw)).toEqual([]);
    });

    describe('in a user file the block is read as written', () => {
      test('nothing is withheld', () => {
        const raw = { autoMode: { soft_deny: 'x', allow: ['a'] } };
        expect(plain(viewOf(['user', raw]).get('autoMode'))).toEqual(raw.autoMode);
      });
    });
  });
});
