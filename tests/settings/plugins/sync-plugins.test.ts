/**
 * settings-reference.md § `syncClaudeAiPlugins` ("Set `false` to stop that download and stop loading
 * the plugins it already synced. Claude Code honors only `false`: `true` is the same as unset";
 * Scope: User, local, or managed, and files passed with `--settings`, "A repository can't turn it off
 * for you"; "In user or managed settings, it also moves them to `~/.claude/plugins/.trash/`"),
 * settings.md § "Exceptions to managed settings precedence" (`false` from any managed source,
 * `--settings`, `~/.claude/settings.json`, or `.claude/settings.local.json` is "honored even when the
 * winning managed source sets `true`; a `false` in `.claude/settings.json` is ignored"), plugins/org.md
 * § "Control matrix" (`false` stops downloading and loading; does not turn off one synced plugin) and
 * plugins/loading.md § "Control which synced plugins load" (turning off every synced plugin moves the
 * downloaded ones to `.trash`).
 */
import { describe, expect, test } from 'bun:test';
import { syncDecision } from '../../../src/settings/plugins/index.ts';
import { spec } from '../../support/spec.ts';
import { plain } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const syncing = { download: true, loadSynced: true, moveToTrash: false };
const stopped = (moveToTrash: boolean) => ({ download: false, loadSynced: false, moveToTrash });
const off = { syncClaudeAiPlugins: false };
const on = { syncClaudeAiPlugins: true };

spec(
  [
    'settings.key.syncClaudeAiPlugins',
    'policy.org.Control matrix.syncClaudeAiPlugins',
    'policy.security.Enforce plugin controls for your organization',
  ],
  () => {
    test('unset: sessions signed in with a claude.ai account sync and load their plugins', () => {
      expect(plain(syncDecision(viewOf()))).toEqual(syncing);
      expect(plain(syncDecision(viewOf(['user', { enabledPlugins: {} }])))).toEqual(syncing);
    });

    test('true is the same as unset', () => {
      for (const scope of ['user', 'local', 'managed', 'flag'] as const) {
        expect(plain(syncDecision(viewOf([scope, on])))).toEqual(syncing);
      }
    });

    test('false in user or managed settings stops the download, stops loading, and moves the synced plugins to the trash', () => {
      expect(plain(syncDecision(viewOf(['user', off])))).toEqual(stopped(true));
      expect(plain(syncDecision(viewOf(['managed', off])))).toEqual(stopped(true));
    });

    test('false in local settings or a --settings file stops download and loading but moves nothing', () => {
      expect(plain(syncDecision(viewOf(['local', off])))).toEqual(stopped(false));
      expect(plain(syncDecision(viewOf(['flag', off])))).toEqual(stopped(false));
    });

    test('a false in the shared project file is ignored: a repository cannot turn it off for you', () => {
      expect(plain(syncDecision(viewOf(['project', off])))).toEqual(syncing);
    });

    test('a stricter false from user, local or --settings is honored even when managed settings say true', () => {
      for (const scope of ['user', 'local', 'flag'] as const) {
        const decision = syncDecision(viewOf(['managed', on], [scope, off]));
        expect(decision.download).toBe(false);
        expect(decision.loadSynced).toBe(false);
      }
    });

    test('a project false does not count even beside a managed true', () => {
      expect(plain(syncDecision(viewOf(['managed', on], ['project', off])))).toEqual(syncing);
    });

    test('a user true does not undo a managed false', () => {
      expect(plain(syncDecision(viewOf(['managed', off], ['user', on])))).toEqual(stopped(true));
    });

    test('the trash move follows the files where the docs say it happens, whatever else is false', () => {
      expect(syncDecision(viewOf(['user', off], ['local', off])).moveToTrash).toBe(true);
      expect(syncDecision(viewOf(['managed', on], ['user', off])).moveToTrash).toBe(true);
      expect(syncDecision(viewOf(['managed', on], ['local', off])).moveToTrash).toBe(false);
    });

    test('a parent-supplied key is not read', () => {
      expect(plain(syncDecision(viewOf(['parent', off])))).toEqual(syncing);
    });
  },
);

describe('what the docs leave open (spec/judgments.md)', () => {
  test('one false in a file that moves is enough to move, even when a higher file only stops', () => {
    expect(syncDecision(viewOf(['flag', off], ['user', off])).moveToTrash).toBe(true);
  });
});
