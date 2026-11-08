/**
 * settings-reference.md § `disableBundledSkills` (Scope "Any file"; `true` "removes bundled skills
 * and workflows and hides built-in commands such as `/init` from the model", `false` "bundled skills
 * load", default unset so they load; "`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` set to `1` turns bundled
 * skills off for one session; whichever of the two turns them off, the other can't turn them back
 * on"; "Skills from plugins, `.claude/skills/`, and `.claude/commands/` are unaffected"), env-vars.md
 * § `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` ("Equivalent to the `disableBundledSkills` setting").
 */
import { describe, expect, test } from 'bun:test';
import { BUNDLED_SKILLS_ENV, bundledSkills } from '../../../src/settings/skills/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const setting = (value: boolean) => ({ disableBundledSkills: value });
const none = {};
const envOn = { [BUNDLED_SKILLS_ENV]: '1' };

spec('settings.key.disableBundledSkills', () => {
  test('unset: bundled skills load and built-in commands are listed to the model', () => {
    expect(plain(bundledSkills(viewOf(), none))).toEqual({
      disabled: false,
      decidedBy: [],
      builtInCommandsListedToModel: true,
    });
  });

  test('true removes bundled skills and hides built-in commands such as /init from the model', () => {
    expect(plain(bundledSkills(viewOf(['user', setting(true)]), none))).toEqual({
      disabled: true,
      decidedBy: ['setting'],
      builtInCommandsListedToModel: false,
    });
  });

  test('false: bundled skills load', () => {
    expect(bundledSkills(viewOf(['user', setting(false)]), none).disabled).toBe(false);
  });

  test('any file sets it', () => {
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      expect(bundledSkills(viewOf([scope, setting(true)]), none).disabled).toBe(true);
    }
  });

  test('CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 turns them off for the session', () => {
    expect(plain(bundledSkills(viewOf(), envOn))).toEqual({
      disabled: true,
      decidedBy: ['env'],
      builtInCommandsListedToModel: false,
    });
  });

  test('the setting cannot turn the variable back on, nor the variable the setting', () => {
    expect(bundledSkills(viewOf(['user', setting(false)]), envOn).disabled).toBe(true);
    expect(
      bundledSkills(viewOf(['user', setting(true)]), { [BUNDLED_SKILLS_ENV]: '0' }).disabled,
    ).toBe(true);
    expect(
      bundledSkills(viewOf(['managed', setting(true)], ['user', setting(false)]), none).disabled,
    ).toBe(true);
  });
});

describe('what the docs leave open (spec/judgments.md)', () => {
  test('both turning them off is reported as both', () => {
    expect(bundledSkills(viewOf(['user', setting(true)]), envOn).decidedBy).toEqual([
      'setting',
      'env',
    ]);
  });

  test('only the documented value 1 of the variable counts', () => {
    for (const value of ['0', 'true', '', undefined]) {
      expect(bundledSkills(viewOf(), { [BUNDLED_SKILLS_ENV]: value }).disabled).toBe(false);
    }
  });

  test('a higher file with false beats a lower true, as any other plain boolean', () => {
    expect(
      bundledSkills(viewOf(['local', setting(false)], ['user', setting(true)]), none).disabled,
    ).toBe(false);
  });
});
