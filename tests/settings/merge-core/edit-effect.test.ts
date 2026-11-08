/**
 * settings.md § When edits take effect ("watches your settings files and reloads them when they
 * change ... edits to `permissions`, `hooks`, and credential helpers such as `apiKeyHelper`";
 * "loads a settings file you create mid-session if its folder existed when the session started. For
 * the project's `.claude/` folder, it loads the file even when you create the folder in the same
 * session"; the `ConfigChange` hook "for each settings-file change it detects, not for managed
 * settings that arrive from MDM or the claude.ai console"; "reads some keys only once, at session
 * start"; removing `permissions.blockReadsOutsideWorkingDirectories`) and § A managed change hasn't
 * reached you; managed-settings.md § Where and when a policy applies.
 */
import { describe, expect, test } from 'bun:test';
import {
  editEffect,
  loadsFileCreatedMidSession,
  managedChangeAdvice,
} from '../../../src/settings/general/index.ts';
import { spec } from '../../support/spec.ts';

spec('settingsMerge.settings.When edits take effect', () => {
  describe('a file edit reaches the running session', () => {
    test('most keys apply at once, including permissions, hooks and apiKeyHelper, with a ConfigChange hook', () => {
      for (const key of ['permissions', 'hooks', 'apiKeyHelper', 'permissions.allow']) {
        for (const scope of ['user', 'project', 'local', 'managed'] as const) {
          expect(editEffect({ scope, arrival: 'file', key })).toEqual({
            applies: 'now',
            configChangeHook: true,
          });
        }
      }
    });

    test('a change to a file as a whole is a reload that fires the hook', () => {
      expect(editEffect({ scope: 'user', arrival: 'file' })).toEqual({
        applies: 'now',
        configChangeHook: true,
      });
    });
  });

  describe('managed settings that arrive from MDM or the claude.ai console', () => {
    test('reach a running session on a schedule rather than on save, and fire no ConfigChange hook', () => {
      for (const arrival of ['mdm', 'server-managed'] as const) {
        expect(editEffect({ scope: 'managed', arrival, key: 'permissions' })).toEqual({
          applies: 'on-schedule',
          configChangeHook: false,
        });
      }
    });

    test('a managed settings file is watched like any file', () => {
      expect(editEffect({ scope: 'managed', arrival: 'file', key: 'permissions' }).applies).toBe(
        'now',
      );
    });
  });

  describe('keys read once at session start', () => {
    test('model, effortLevel and modelSettings wait for the next session, whatever file holds them', () => {
      for (const key of ['model', 'effortLevel', 'modelSettings']) {
        expect(editEffect({ scope: 'user', arrival: 'file', key })).toEqual({
          applies: 'next-session',
          configChangeHook: true,
        });
      }
    });

    test('admin-side keys wait for a restart too: requiredMinimumVersion, forceRemoteSettingsRefresh and policyHelper', () => {
      for (const key of ['requiredMinimumVersion', 'forceRemoteSettingsRefresh', 'policyHelper']) {
        expect(editEffect({ scope: 'managed', arrival: 'server-managed', key }).applies).toBe(
          'next-session',
        );
      }
    });

    test('removing permissions.blockReadsOutsideWorkingDirectories keeps the block until each running session restarts, setting it applies at once', () => {
      const key = 'permissions.blockReadsOutsideWorkingDirectories';
      expect(editEffect({ scope: 'user', arrival: 'file', key, removed: true }).applies).toBe(
        'after-restart',
      );
      expect(editEffect({ scope: 'user', arrival: 'file', key }).applies).toBe('now');
      expect(
        editEffect({ scope: 'user', arrival: 'file', key: 'permissions.allow', removed: true })
          .applies,
      ).toBe('now');
    });
  });

  describe('a settings file created mid-session', () => {
    test('is loaded if its folder existed when the session started', () => {
      for (const scope of ['user', 'local', 'managed'] as const) {
        expect(loadsFileCreatedMidSession(scope, true)).toBe(true);
        expect(loadsFileCreatedMidSession(scope, false)).toBe(false);
      }
    });

    test('the project file is loaded even when the .claude folder is created in the same session', () => {
      expect(loadsFileCreatedMidSession('project', false)).toBe(true);
      expect(loadsFileCreatedMidSession('project', true)).toBe(true);
    });
  });
});

// An id with an apostrophe is a template literal: the SP2 gate cannot read it from a quoted string.
spec(`settingsMerge.settings.A managed change hasn't reached you`, () => {
  describe('restart first; then /status names the source that applies', () => {
    test('managed sources reach a running session on a schedule, so the advice before a restart is to restart', () => {
      expect(editEffect({ scope: 'managed', arrival: 'mdm', key: 'permissions' }).applies).toBe(
        'on-schedule',
      );
      expect(
        managedChangeAdvice({
          restarted: false,
          changedSource: 'managed-settings.json',
          statusSource: 'server-managed settings',
        }),
      ).toBe('restart');
    });

    test('after a restart a /status that names another source than the changed one means a higher-priority source applies', () => {
      expect(
        managedChangeAdvice({
          restarted: true,
          changedSource: 'managed-settings.json',
          statusSource: 'server-managed settings',
        }),
      ).toBe('higher-source-applies');
    });

    test('after a restart a /status that names the changed source means the change has reached the session', () => {
      expect(
        managedChangeAdvice({
          restarted: true,
          changedSource: 'managed-settings.json',
          statusSource: 'managed-settings.json',
        }),
      ).toBe('reached');
    });
  });
});
