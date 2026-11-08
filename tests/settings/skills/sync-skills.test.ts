/**
 * settings-reference.md § `syncClaudeAiSkills` ("Set `false` to stop that download and stop loading
 * the skills it already synced. Claude Code honors only `false`: `true` is the same as unset";
 * Scope: User, local, or managed, and files passed with `--settings`, "A repository can't turn it
 * off for you"; "In user or managed settings, it also moves them to `~/.claude/skills/.trash/`"),
 * settings.md § "Exceptions to managed settings precedence" (`false` from any managed source,
 * `--settings`, `~/.claude/settings.json`, or `.claude/settings.local.json` is "honored even when the
 * winning managed source sets `true`; a `false` in `.claude/settings.json` is ignored"), skills.md §
 * "How synced skills behave" (a user `false` stops downloading and moves the synced skills to
 * `.trash`; "To stop syncing while leaving Skills on, it can set the same key in managed settings").
 */
import { expect, test } from 'bun:test';
import { syncSkillsDecision } from '../../../src/settings/skills/index.ts';
import { syncDecision } from '../../../src/settings/plugins/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { plain } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const syncing = { download: true, loadSynced: true, moveToTrash: false };
const stopped = (moveToTrash: boolean) => ({ download: false, loadSynced: false, moveToTrash });
const off = { syncClaudeAiSkills: false };
const on = { syncClaudeAiSkills: true };

spec('settings.key.syncClaudeAiSkills', () => {
  test('unset: sessions signed in with a claude.ai account sync their skills', () => {
    expect(plain(syncSkillsDecision(viewOf()))).toEqual(syncing);
  });

  test('true is the same as unset', () => {
    for (const scope of ['user', 'local', 'managed', 'flag'] as const) {
      expect(plain(syncSkillsDecision(viewOf([scope, on])))).toEqual(syncing);
    }
  });

  test('false in user or managed settings stops download and loading and moves the synced skills to the trash', () => {
    expect(plain(syncSkillsDecision(viewOf(['user', off])))).toEqual(stopped(true));
    expect(plain(syncSkillsDecision(viewOf(['managed', off])))).toEqual(stopped(true));
  });

  test('false in local settings or a --settings file stops download and loading but moves nothing', () => {
    expect(plain(syncSkillsDecision(viewOf(['local', off])))).toEqual(stopped(false));
    expect(plain(syncSkillsDecision(viewOf(['flag', off])))).toEqual(stopped(false));
  });

  test('a false in the shared project file is ignored: a repository cannot turn it off for you', () => {
    expect(plain(syncSkillsDecision(viewOf(['project', off])))).toEqual(syncing);
    expect(plain(syncSkillsDecision(viewOf(['managed', on], ['project', off])))).toEqual(syncing);
  });

  test('a stricter false from user, local or --settings is honored even when managed settings say true', () => {
    for (const scope of ['user', 'local', 'flag'] as const) {
      const decision = syncSkillsDecision(viewOf(['managed', on], [scope, off]));
      expect(decision.download).toBe(false);
      expect(decision.loadSynced).toBe(false);
    }
  });

  test('a user true does not undo a managed false', () => {
    expect(plain(syncSkillsDecision(viewOf(['managed', off], ['user', on])))).toEqual(
      stopped(true),
    );
  });

  test('the trash move follows the files where the docs say it happens', () => {
    expect(syncSkillsDecision(viewOf(['managed', on], ['user', off])).moveToTrash).toBe(true);
    expect(syncSkillsDecision(viewOf(['managed', on], ['local', off])).moveToTrash).toBe(false);
  });

  test('a parent-supplied key is not read', () => {
    expect(plain(syncSkillsDecision(viewOf(['parent', off])))).toEqual(syncing);
  });

  test('the skills key and the plugins key are independent', () => {
    const view = viewOf(['user', off]);
    expect(plain(syncDecision(view))).toEqual(syncing);
    expect(syncSkillsDecision(viewOf(['user', { syncClaudeAiPlugins: false }])).download).toBe(
      true,
    );
  });
});
