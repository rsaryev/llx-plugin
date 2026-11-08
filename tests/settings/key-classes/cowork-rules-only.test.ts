/**
 * managed-settings.md § Keep Cowork folder access when only managed rules apply: with
 * `allowManagedPermissionRulesOnly` Claude Code "keeps only the allow rules in the managed policy: it
 * drops allow rules a host supplies as parent settings, as `--allowedTools`, or in a settings file";
 * the fix is to add the folder's allow rules to "the managed source Claude Code selects", which on an
 * MDM-managed fleet is the MDM policy rather than a separate managed settings file.
 */
import { describe, expect, test } from 'bun:test';
import {
  createGeneralView,
  permissionRuleLists,
  type LocalFileFacts,
} from '../../../src/settings/general/index.ts';
import { readSettingsLayer } from '../../../src/settings/index.ts';
import { compose } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const TRUSTED = () => true;
const UNTRACKED: LocalFileFacts = { tracked: false, claudeDirIsSymlink: false };
const COWORK = 'Edit(~/CoworkProjects/**)';
const HOST_FOLDER = 'Edit(~/Documents/connected-folder/**)';

const allowRules = (managedSettings: Record<string, unknown>) => {
  const view = createGeneralView([
    readSettingsLayer('managed', managedSettings).layer,
    readSettingsLayer('parent', { permissions: { allow: [HOST_FOLDER] } }).layer,
    readSettingsLayer('flag', { permissions: { allow: ['Bash(flag *)'] } }).layer,
    readSettingsLayer('user', { permissions: { allow: ['Bash(user *)'] } }).layer,
  ]);
  return permissionRuleLists(view, TRUSTED, UNTRACKED).allow.map((entry) => entry.rule);
};

spec('policy.managed.Keep Cowork folder access when only managed rules apply', () => {
  describe('with allowManagedPermissionRulesOnly only the managed allow rules apply', () => {
    test('the host folder rules, a --settings file and a user file lose their pre-approval', () => {
      expect(allowRules({ allowManagedPermissionRulesOnly: true })).toEqual([]);
    });

    test('the documented policy keeps allow rules for the Cowork folder', () => {
      const policy = { allowManagedPermissionRulesOnly: true, permissions: { allow: [COWORK] } };
      expect(allowRules(policy)).toEqual([COWORK]);
    });

    test('without the lock the host folder rules apply beside the managed ones', () => {
      expect(allowRules({ permissions: { allow: [COWORK] } }).toSorted()).toEqual(
        [COWORK, HOST_FOLDER, 'Bash(flag *)', 'Bash(user *)'].toSorted(),
      );
    });
  });

  describe('the rules belong to the managed source Claude Code selects', () => {
    const rules = (held: Parameters<typeof compose>[0]) => allowRules(compose(held).layer.settings);

    test('on an MDM-managed fleet the rules in a managed settings file below the MDM policy do not apply', () => {
      const mdm = { allowManagedPermissionRulesOnly: true };
      const file = { permissions: { allow: [COWORK] } };
      expect(rules({ plist: mdm, file })).toEqual([]);
    });

    test('the same rules in the MDM policy apply', () => {
      const mdm = { allowManagedPermissionRulesOnly: true, permissions: { allow: [COWORK] } };
      expect(rules({ plist: mdm, file: { model: 'a' } })).toEqual([COWORK]);
    });
  });
});
