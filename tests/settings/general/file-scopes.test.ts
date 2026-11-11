/**
 * The settings files a person can name (settings.md, "Settings files and who they affect"): the
 * four scopes `FileScope` holds, as a list and a guard. A name for what `reachOf` already takes,
 * so outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { FILE_SCOPES, isFileScope, reachOf } from '../../../src/settings/general/index.ts';

describe('FILE_SCOPES and isFileScope', () => {
  test('the four file scopes, each one reachOf takes', () => {
    expect(FILE_SCOPES).toEqual(['user', 'project', 'local', 'managed']);
    for (const scope of FILE_SCOPES) {
      expect(reachOf(scope, { committed: false, serverManaged: false }).yourMachine).toBeDefined();
    }
  });

  test('a scope that is no file of a machine is not one', () => {
    expect(FILE_SCOPES.every(isFileScope)).toBe(true);
    for (const scope of ['flag', 'parent', 'addDir', 'policy', '']) {
      expect(isFileScope(scope)).toBe(false);
    }
  });
});
