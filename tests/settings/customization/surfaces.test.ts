/**
 * settings-reference.md § `strictPluginOnlyCustomization` (Scope "Managed"; Type "`true` to lock all
 * four kinds of customization, or an array naming the kinds to lock, from `"skills"`, `"agents"`,
 * `"hooks"`, and `"mcp"`"; Default "unset, so nothing is locked"; the example `["skills", "hooks"]`
 * "locks skills and hooks and leaves agents and MCP servers unlocked"; "Claude Code ignores surface
 * names it doesn't recognize rather than failing the settings file"), managed-settings.md § Invalid
 * entries in managed settings ("Treated as `true`, locking all four surfaces, when the value is
 * neither a boolean nor an array. An array entry that this version doesn't recognize as a surface
 * locks nothing; a status note counts such entries"), claude-apps-gateway.md § Settings the locks
 * don't cover ("this key passes the filter regardless of any lock").
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_ONLY_SURFACES } from '../../../src/protocol/settings-keys.ts';
import { readSurfaceLocks } from '../../../src/settings/customization/index.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import { spec } from '../../support/spec.ts';

const lockedBy = (value: unknown): readonly string[] =>
  PLUGIN_ONLY_SURFACES.filter((surface) => readSurfaceLocks(value).locked.has(surface));

spec('settings.key.strictPluginOnlyCustomization', () => {
  describe('the value', () => {
    test('true locks all four kinds of customization', () => {
      expect(lockedBy(true)).toEqual(['skills', 'agents', 'hooks', 'mcp']);
    });

    test('an array locks the kinds it names: the docs example locks skills and hooks only', () => {
      expect(lockedBy(['skills', 'hooks'])).toEqual(['skills', 'hooks']);
    });

    test('unset locks nothing', () => {
      expect(lockedBy(undefined)).toEqual([]);
      expect(customizationOf([]).locked.size).toBe(0);
    });

    test('an empty array names no kind, so it locks nothing', () => {
      expect(lockedBy([])).toEqual([]);
    });

    test('a surface name this version does not recognize locks nothing and is counted', () => {
      const read = readSurfaceLocks(['skills', 'slashCommands', 'mpc']);
      expect([...read.locked]).toEqual(['skills']);
      expect(read.unknownNames).toBe(2);
      expect(readSurfaceLocks(['skills', 'hooks']).unknownNames).toBe(0);
    });

    test('an entry that is not even a string is a name no surface has: counted, locks nothing', () => {
      const read = readSurfaceLocks(['agents', 7, null, { hooks: true }]);
      expect([...read.locked]).toEqual(['agents']);
      expect(read.unknownNames).toBe(3);
    });

    test('a value that is neither a boolean nor an array is treated as true: all four locked', () => {
      for (const value of ['skills', 'true', 1, { skills: true }]) {
        expect(lockedBy(value)).toEqual(['skills', 'agents', 'hooks', 'mcp']);
      }
    });
  });

  describe('where it is read from', () => {
    test('managed settings lock; the same key in user, project, local or --settings files locks nothing', () => {
      expect(customizationOf(locking(['mcp'])).locked).toEqual(new Set(['mcp']));
      for (const scope of ['user', 'project', 'local', 'flag'] as const) {
        const policy = customizationOf([[scope, { strictPluginOnlyCustomization: true }]]);
        expect(policy.locked.size).toBe(0);
      }
    });

    test('a user file cannot lift a managed lock, whatever it says', () => {
      const policy = customizationOf([
        ...locking(['hooks']),
        ['user', { strictPluginOnlyCustomization: false }],
        ['local', { strictPluginOnlyCustomization: [] }],
      ]);
      expect(policy.locked).toEqual(new Set(['hooks']));
    });

    test('an unreadable managed value repairs to true when the file is read', () => {
      expect(customizationOf(locking('everything')).locked.size).toBe(4);
    });

    test('the policy counts the names it ignored, for the status note', () => {
      expect(customizationOf(locking(['skills', 'plugins'])).unknownSurfaceNames).toBe(1);
    });
  });

  describe('parent settings (the SDK managedSettings option)', () => {
    const parentLock = [['parent', { strictPluginOnlyCustomization: ['agents'] }]] as const;

    test('a host without an administrator can lock through managedSettings', () => {
      expect(customizationOf(parentLock).locked).toEqual(new Set(['agents']));
    });

    test('where an administrator deploys managed settings the parent is ignored unless they opt in', () => {
      expect(customizationOf(parentLock, { hasManagedSettings: true }).locked.size).toBe(0);
      const merged = customizationOf(parentLock, { hasManagedSettings: true, parentMerge: true });
      expect(merged.locked).toEqual(new Set(['agents']));
    });
  });
});
