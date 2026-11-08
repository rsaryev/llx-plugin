/**
 * plugins/mods/admin.md § Know which controls still apply ("Mods can't change the permission
 * prompt"); plugins/mods/interface.md: "The permission prompt isn't a render site ... The question
 * dialog, `AskUserQuestion`, is one."
 */
import { expect, test } from 'bun:test';
import { RENDER_SITE_NAMES } from '../../../src/protocol/mods-ui-names.ts';
import { spec } from '../../support/spec.ts';

spec("policy.mods.Know which controls still apply.Mods can't change the permission prompt", () => {
  test('no render site is the permission prompt, so a mod cannot change what it shows', () => {
    expect(RENDER_SITE_NAMES.filter((name) => /permission/i.test(name))).toEqual([]);
  });
  test('the question dialog is a render site', () => {
    expect(RENDER_SITE_NAMES).toContain('AskUserQuestion');
  });
});
