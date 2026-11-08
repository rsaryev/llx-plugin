/**
 * settings-reference.md § `disableSkillShellExecution` (Scope "Any file. A `true` in managed settings
 * can't be overridden by `false` elsewhere."; `true` replaces each inline shell command with `[shell
 * command execution disabled by policy]`, `false` runs it, unset runs it; "Bundled skills and skills
 * deployed through managed settings are unaffected"), skills.md § "Inject dynamic context" ("from
 * user, project, plugin, or additional-directory sources ... Bundled and managed skills are not
 * affected"), claude-apps-gateway.md § "How hook and skill keys in parent settings take effect"
 * (`disableSkillShellExecution: true` in `managedSettings` "Takes effect"; parent settings are ignored
 * where an administrator deploys managed settings unless it opts in).
 *
 * Verdict level only: replacing the `!` blocks is the skills expansion's, which does not exist yet.
 */
import { describe, expect, test } from 'bun:test';
import {
  SHELL_ORIGINS,
  createSkillSettingsPolicy,
  shellVerdict,
  type ShellOrigin,
} from '../../../src/settings/skills/index.ts';
import { viewOf, type Source } from '../../support/plugin-settings.ts';
import { issuesOf, layerOf, plain } from '../../support/settings-layers.ts';
import { createPolicyView } from '../../../src/settings/index.ts';
import { spec } from '../../support/spec.ts';

const flagged = (value: boolean) => ({ disableSkillShellExecution: value });
const blocked = { run: false, replacement: '[shell command execution disabled by policy]' };
const runs = { run: true };
const REACHED = ['user', 'project', 'plugin', 'addDir'] as const satisfies readonly ShellOrigin[];
const EXEMPT = ['bundled', 'managed'] as const satisfies readonly ShellOrigin[];

spec('settings.key.disableSkillShellExecution', () => {
  test('true: inline shell of user, project, plugin and additional-directory skills does not run', () => {
    for (const origin of REACHED) {
      expect(plain(shellVerdict(viewOf(['user', flagged(true)]), origin))).toEqual(blocked);
    }
  });

  test('true: bundled skills and skills deployed through managed settings are unaffected', () => {
    for (const origin of EXEMPT) {
      expect(plain(shellVerdict(viewOf(['managed', flagged(true)]), origin))).toEqual(runs);
    }
  });

  test('false and unset: inline shell runs for every origin', () => {
    for (const origin of SHELL_ORIGINS) {
      expect(plain(shellVerdict(viewOf(['user', flagged(false)]), origin))).toEqual(runs);
      expect(plain(shellVerdict(viewOf(), origin))).toEqual(runs);
    }
  });

  test('any file sets it', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(plain(shellVerdict(viewOf([scope, flagged(true)]), 'user'))).toEqual(blocked);
    }
  });

  test('a true in managed settings is not overridden by false in any other file', () => {
    for (const scope of ['parent', 'flag', 'local', 'project', 'user'] as const) {
      expect(
        plain(shellVerdict(viewOf(['managed', flagged(true)], [scope, flagged(false)]), 'plugin')),
      ).toEqual(blocked);
    }
    const twoManaged = createPolicyView([
      layerOf('managed', flagged(false)),
      layerOf('managed', flagged(true)),
    ]);
    expect(plain(shellVerdict(twoManaged, 'project'))).toEqual(blocked);
  });
});

const context = (hasManagedSettings: boolean, parentMerge = false) => ({
  hasManagedSettings,
  parentMerge,
  env: {},
});

const shellOf = (hasManaged: boolean, merge: boolean, ...sources: Source[]) =>
  createSkillSettingsPolicy(viewOf(...sources), context(hasManaged, merge)).shell('user');

describe('the SDK managedSettings of an embedding host', () => {
  spec('settings.key.disableSkillShellExecution', () => {
    test('true passed in managedSettings takes effect', () => {
      expect(plain(shellOf(false, false, ['parent', flagged(true)]))).toEqual(blocked);
    });

    test('a true in the parent settings is not overridden by false in a lower file', () => {
      expect(
        plain(shellOf(false, false, ['parent', flagged(true)], ['user', flagged(false)])),
      ).toEqual(blocked);
    });

    test('on a machine with an administrator, parent settings are ignored unless the administrator opted in', () => {
      expect(plain(shellOf(true, false, ['parent', flagged(true)]))).toEqual(runs);
      expect(
        plain(shellOf(false, false, ['managed', flagged(false)], ['parent', flagged(true)])),
      ).toEqual(runs);
      expect(plain(shellOf(true, true, ['parent', flagged(true)]))).toEqual(blocked);
    });
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('a managed value that is not a Boolean reads as true, the restrictive one (src/settings/repair-values.ts)', () => {
    expect(issuesOf('managed', { disableSkillShellExecution: 'yes' }).length).toBeGreaterThan(0);
    expect(
      plain(shellVerdict(viewOf(['managed', { disableSkillShellExecution: 'yes' }]), 'user')),
    ).toEqual(blocked);
  });
});
