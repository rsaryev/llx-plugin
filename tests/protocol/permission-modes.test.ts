/**
 * permissions.md § Permission modes: the six modes of the table, and the `default` row's "Claude
 * Code accepts `manual` as an alias". Each mode has its own requirement ids, proven where the mode
 * decides something; this file proves only the name list and the alias, so it is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import {
  PERMISSION_BEHAVIORS,
  PERMISSION_MODES,
  normalizePermissionMode,
} from '../../src/protocol/permission-modes.ts';

// Copied by hand from the table's first column (permissions.md, "Permission modes").
const DOCUMENTED_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];

describe('permission modes', () => {
  test('are the six modes of the permissions.md table', () => {
    const modes: readonly string[] = PERMISSION_MODES;
    expect(modes.toSorted()).toEqual(DOCUMENTED_MODES.toSorted());
  });

  test('the behaviours are allow, deny and ask', () => {
    const behaviors: readonly string[] = PERMISSION_BEHAVIORS;
    expect(behaviors.toSorted()).toEqual(['allow', 'ask', 'deny']);
  });

  test('every mode name normalizes to itself', () => {
    for (const mode of DOCUMENTED_MODES)
      expect<string | undefined>(normalizePermissionMode(mode)).toBe(mode);
  });

  test('manual is an alias of default', () => {
    expect(normalizePermissionMode('manual')).toBe('default');
  });

  test('anything else, including object prototype keys and other casing, is not a mode', () => {
    for (const raw of ['Manual', 'DEFAULT', 'bypass', '', 'constructor', '__proto__', 'toString']) {
      expect(normalizePermissionMode(raw)).toBeUndefined();
    }
  });
});
