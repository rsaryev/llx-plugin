/**
 * settings-reference.md § When Claude Code applies `env` values (its four bullets); permissions.md §
 * What runs before you trust a folder (the first row: the `env` block is "Used" when only a parent
 * folder is trusted and in `claude -p`, where the folder is never trusted); permissions.md § Workspace
 * trust ("Claude Code shows the trust dialog in interactive sessions only").
 */
import { describe, expect, test } from 'bun:test';
import {
  appliesAtStartup,
  envAfterCd,
  envChange,
  resolveEnv,
} from '../../../src/settings/env/index.ts';
import { PRINT_MODE, TRUSTED, UNTRUSTED, sessionEnv } from '../../support/env.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const PROJECT = ['project', { PROJECT_VAR: 'p' }] as const;
const LOCAL = ['local', { LOCAL_VAR: 'l' }] as const;

spec('settings.reference.When Claude Code applies env values', () => {
  describe('user settings, --settings and managed settings apply at startup', () => {
    test('whether or not the folder is trusted', () => {
      for (const trust of [TRUSTED, UNTRUSTED, PRINT_MODE]) {
        for (const scope of ['user', 'flag', 'managed'] as const) {
          expect(appliesAtStartup(scope, trust)).toBe(true);
        }
      }
      const resolved = sessionEnv(
        [
          ['user', { U: '1' }],
          ['flag', { F: '1' }],
          ['managed', { M: '1' }],
        ],
        { trust: UNTRUSTED },
      );
      expect(resolved.settings).toEqual({ U: '1', F: '1', M: '1' });
    });

    test('and again in the running session when a saved change alters the merged env', () => {
      const before = sessionEnv([['user', { A: '1', B: '1' }]]).settings;
      const after = sessionEnv([['user', { A: '2', B: '1', C: '1' }]]).settings;
      expect(envChange(before, after).set).toEqual({ A: '2', C: '1' });
      expect(envChange(before, before).set).toEqual({});
    });

    test('a removed variable stays set in the running session until the next launch', () => {
      const change = envChange({ A: '1', B: '1' }, { B: '1' });
      expect(change.keptUntilRelaunch).toEqual(['A']);
      expect(change.set).toEqual({});
    });
  });

  describe('project and local settings apply after you trust the workspace, or at startup in -p mode', () => {
    test('an interactive session that has not trusted the folder applies neither file', () => {
      const resolved = sessionEnv([PROJECT, LOCAL, ['user', { USER_VAR: 'u' }]], {
        trust: UNTRUSTED,
      });
      expect(resolved.settings).toEqual({ USER_VAR: 'u' });
      expect(resolved.notApplied.map((one) => [one.name, one.why])).toEqual([
        ['PROJECT_VAR', 'awaiting-trust'],
        ['LOCAL_VAR', 'awaiting-trust'],
      ]);
    });

    test('once the workspace is trusted both apply', () => {
      expect(sessionEnv([PROJECT, LOCAL], { trust: TRUSTED }).settings).toEqual({
        PROJECT_VAR: 'p',
        LOCAL_VAR: 'l',
      });
    });

    test('-p mode never shows the trust dialog, so both apply at startup', () => {
      expect(appliesAtStartup('project', PRINT_MODE)).toBe(true);
      expect(sessionEnv([PROJECT, LOCAL], { trust: PRINT_MODE }).settings).toEqual({
        PROJECT_VAR: 'p',
        LOCAL_VAR: 'l',
      });
    });

    test('and again when a saved change alters the merged env', () => {
      const before = sessionEnv([PROJECT]).settings;
      const after = sessionEnv([['project', { PROJECT_VAR: 'changed' }]]).settings;
      expect(envChange(before, after).set).toEqual({ PROJECT_VAR: 'changed' });
    });
  });

  describe('variables Claude Code classifies as safe apply at startup from every settings file', () => {
    const isSafe = (name: string) => name === 'API_TIMEOUT_MS' || name === 'DISABLE_AUTO_COMPACT';

    test('a safe variable of a project or local file applies before the folder is trusted', () => {
      const resolved = sessionEnv(
        [
          ['project', { API_TIMEOUT_MS: '1', OTHER: 'x' }],
          ['local', { DISABLE_AUTO_COMPACT: '1' }],
        ],
        { trust: UNTRUSTED, isSafeAtStartup: isSafe },
      );
      expect(resolved.settings).toEqual({ API_TIMEOUT_MS: '1', DISABLE_AUTO_COMPACT: '1' });
      expect(resolved.notApplied.map((one) => one.name)).toEqual(['OTHER']);
    });

    test('apart from the variables project and local settings cannot set, safe or not', () => {
      const resolved = sessionEnv([['project', { CLAUDE_CONFIG_DIR: '/x', API_TIMEOUT_MS: '1' }]], {
        trust: UNTRUSTED,
        isSafeAtStartup: () => true,
      });
      expect(resolved.settings).toEqual({ API_TIMEOUT_MS: '1' });
    });
  });

  describe('after /cd the new directory project and local values go on top of the previous ones', () => {
    test('a variable the new directory sets replaces the old value, and the old directory keeps the rest', () => {
      const previous = sessionEnv([
        ['user', { U: 'user', SHARED: 'user' }],
        ['project', { P: 'old', SHARED: 'old' }],
      ]);
      const entered = resolveEnv({
        layers: [
          layerOf('project', { env: { P: 'new', NEW: '1' } }),
          layerOf('local', { env: { L: '1' } }),
        ],
        trust: TRUSTED,
        shell: {},
      });
      const after = envAfterCd(previous, entered);
      expect(after.settings).toEqual({ U: 'user', SHARED: 'old', P: 'new', NEW: '1', L: '1' });
      expect(after.subprocess).toEqual(after.settings);
      expect(after.origin.P).toBe('project');
    });

    test('values of the directory that are not project or local (user and managed apply from startup) are not applied again', () => {
      const previous = sessionEnv([['user', { U: 'startup' }]]);
      const entered = resolveEnv({
        layers: [layerOf('user', { env: { U: 'again' } })],
        trust: TRUSTED,
        shell: {},
      });
      expect(envAfterCd(previous, entered).settings).toEqual({ U: 'startup' });
    });
  });
});

spec('trust.behavior.What runs before you trust a folder.env', () => {
  test('with only a parent folder trusted the env block of the repository is used', () => {
    const resolved = sessionEnv([['project', { PROJECT_VAR: 'p' }]], {
      trust: { interactive: true, trusted: true },
    });
    expect(resolved.settings).toEqual({ PROJECT_VAR: 'p' });
  });

  test('in claude -p the folder is never trusted and the env block is still used', () => {
    const resolved = sessionEnv(
      [
        ['project', { PROJECT_VAR: 'p' }],
        ['local', { LOCAL_VAR: 'l' }],
      ],
      {
        trust: PRINT_MODE,
      },
    );
    expect(resolved.settings).toEqual({ PROJECT_VAR: 'p', LOCAL_VAR: 'l' });
    expect(resolved.notApplied).toEqual([]);
  });

  test('an interactive session that did not accept the dialog uses none of it', () => {
    expect(sessionEnv([['project', { PROJECT_VAR: 'p' }]], { trust: UNTRUSTED }).settings).toEqual(
      {},
    );
  });
});
