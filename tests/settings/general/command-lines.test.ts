/**
 * settings-reference.md § `statusLine` (an object with `type: "command"` and a `command`, optional
 * `padding`, `refreshInterval` of at least 1 and `hideVimModeIndicator`; any file; unset by default),
 * § `fileSuggestion`, § `subagentStatusLine`, and § Status line and file suggestion gates ("Off
 * entirely", then "Narrowed to managed settings"; "Otherwise it skips your value without warning");
 * permissions.md § What runs before you trust a folder (the workspace trust rule of hooks).
 */
import { describe, expect, test } from 'bun:test';
import { COMMAND_LINE_KEYS, readCommandLine } from '../../../src/settings/general/index.ts';
import { issuesOf } from '../../support/settings-layers.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { flag, hookPolicyOf, managed, user, project } from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const LINE = (command: string) => ({ type: 'command' as const, command });
const EXAMPLE = {
  type: 'command' as const,
  command: `jq -r '"[\\(.model.display_name)] \\(.context_window.used_percentage // 0)% context"'`,
  padding: 2,
};

const run = (
  key: (typeof COMMAND_LINE_KEYS)[number],
  sources: Parameters<typeof hookPolicyOf>[0],
  context = {},
) => readCommandLine(viewOf(...sources), key, hookPolicyOf(sources, { context }));

spec('settings.key.statusLine', () => {
  test('the docs example: a command with two characters of padding', () => {
    expect(run('statusLine', [user({ statusLine: EXAMPLE })])).toEqual({
      runs: { value: EXAMPLE, scope: 'user' },
    });
  });

  test('unset by default, so there is no status line', () => {
    expect(run('statusLine', [user({})])).toEqual({ runs: undefined });
  });

  test('any file carries it, and the highest file that sets it applies whole', () => {
    expect(
      run('statusLine', [user({ statusLine: LINE('a') }), project({ statusLine: LINE('b') })]).runs,
    ).toEqual({
      value: LINE('b'),
      scope: 'project',
    });
    // The fields of two files never mix: the value of the highest file is the whole value.
    const mixed = run('statusLine', [
      user({ statusLine: { ...LINE('a'), padding: 4 } }),
      project({ statusLine: LINE('b') }),
    ]);
    expect(mixed.runs?.value).toEqual(LINE('b'));
  });

  describe('the optional fields', () => {
    test('padding, refreshInterval and hideVimModeIndicator are kept when valid', () => {
      const value = { ...LINE('s'), padding: 0, refreshInterval: 1, hideVimModeIndicator: true };
      expect(run('statusLine', [user({ statusLine: value })]).runs?.value).toEqual(value);
    });

    test('a refreshInterval under the minimum of 1, or a field of the wrong type, is dropped with a warning and the rest stays', () => {
      const bad = {
        ...LINE('s'),
        padding: 'wide',
        refreshInterval: 0,
        hideVimModeIndicator: 'yes',
      };
      expect(run('statusLine', [user({ statusLine: bad })]).runs?.value).toEqual(LINE('s'));
      const found = issuesOf('user', { statusLine: bad }).map((one) => one.message);
      expect(found).toHaveLength(3);
      expect(found.join(' ')).toContain('"statusLine.refreshInterval"');
    });
  });

  test('a value without type "command" or without a command string is dropped with a warning', () => {
    for (const bad of [
      'jq .',
      { command: 'x' },
      { type: 'script', command: 'x' },
      { type: 'command' },
      { type: 'command', command: 3 },
    ]) {
      expect(run('statusLine', [user({ statusLine: bad })]).runs).toBeUndefined();
      expect(issuesOf('user', { statusLine: bad })[0]?.message).toContain('"statusLine"');
    }
  });
});

spec('settings.reference.Status line and file suggestion gates', () => {
  const KEYS = COMMAND_LINE_KEYS;
  const set = (value: string) => ({
    statusLine: LINE(value),
    fileSuggestion: LINE(value),
    subagentStatusLine: LINE(value),
  });

  describe('off entirely', () => {
    test('when managed settings set disableAllHooks, none of the three runs, not even a managed value', () => {
      for (const key of KEYS) {
        const result = run(key, [managed({ disableAllHooks: true, ...set('managed') })]);
        expect(result).toEqual({ runs: undefined, skippedBecause: 'off' });
      }
    });

    test('when the folder is not trusted under the workspace trust rule of hooks in settings files', () => {
      for (const key of KEYS) {
        const result = run(key, [user(set('mine'))], { folderTrusted: false });
        expect(result).toEqual({ runs: undefined, skippedBecause: 'off' });
      }
    });

    test('checked before the narrowing: an untrusted folder is off even where only a managed value would run', () => {
      const result = run('statusLine', [managed({ allowManagedHooksOnly: true, ...set('m') })], {
        folderTrusted: false,
      });
      expect(result.skippedBecause).toBe('off');
    });
  });

  describe('narrowed to managed settings', () => {
    test('when allowManagedHooksOnly is set: a managed value runs, a value of any other file is skipped', () => {
      const lock = managed({ allowManagedHooksOnly: true });
      for (const key of KEYS) {
        const mine = run(key, [lock, user(set('mine'))]);
        expect(mine).toEqual({ runs: undefined, skippedBecause: 'narrowed' });
        const deployed = run(key, [
          managed({ allowManagedHooksOnly: true, ...set('org') }),
          user(set('mine')),
        ]);
        expect(deployed.runs).toEqual({ value: LINE('org'), scope: 'managed' });
      }
    });

    test('when disableAllHooks is true outside managed settings after precedence', () => {
      const result = run('statusLine', [
        user({ disableAllHooks: true, ...set('mine') }),
        managed(set('org')),
      ]);
      expect(result.runs).toEqual({ value: LINE('org'), scope: 'managed' });
      expect(run('statusLine', [user({ disableAllHooks: true, ...set('mine') })])).toEqual({
        runs: undefined,
        skippedBecause: 'narrowed',
      });
    });

    test('a disableAllHooks that precedence overrides does not narrow', () => {
      const result = run('statusLine', [
        user({ disableAllHooks: true }),
        flag({ disableAllHooks: false }),
        project(set('p')),
      ]);
      expect(result.runs?.value).toEqual(LINE('p'));
    });

    test('when Claude Code starts with --safe-mode', () => {
      expect(run('statusLine', [user(set('mine'))], { safeMode: true })).toEqual({
        runs: undefined,
        skippedBecause: 'narrowed',
      });
      expect(
        run('statusLine', [managed(set('org')), user(set('mine'))], { safeMode: true }).runs?.value,
      ).toEqual(LINE('org'));
    });

    test('the managed value runs even when a higher file sets its own value', () => {
      const result = run('fileSuggestion', [
        managed({ allowManagedHooksOnly: true, ...set('org') }),
        flag(set('flag')),
        user(set('mine')),
      ]);
      expect(result.runs).toEqual({ value: LINE('org'), scope: 'managed' });
    });
  });

  test('with no gate the value of the highest file runs, for all three keys', () => {
    for (const key of KEYS) {
      expect(run(key, [user(set('a')), project(set('b'))]).runs).toEqual({
        value: LINE('b'),
        scope: 'project',
      });
    }
  });

  test('skipping a value is silent: reading the file reports nothing', () => {
    expect(issuesOf('user', set('mine'))).toEqual([]);
  });

  test('the three keys are statusLine, fileSuggestion and subagentStatusLine', () => {
    expect([...COMMAND_LINE_KEYS]).toEqual(['statusLine', 'fileSuggestion', 'subagentStatusLine']);
  });
});

describe('fileSuggestion and subagentStatusLine shapes', () => {
  test('both are an object with type command and a command string', () => {
    expect(
      run('fileSuggestion', [user({ fileSuggestion: LINE('~/.claude/file-suggestion.sh') })]).runs
        ?.value,
    ).toEqual(LINE('~/.claude/file-suggestion.sh'));
    expect(issuesOf('user', { subagentStatusLine: { type: 'command' } })[0]?.message).toContain(
      '"subagentStatusLine"',
    );
  });
});
