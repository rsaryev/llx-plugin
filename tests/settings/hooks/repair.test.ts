/**
 * errors.md § "Managed settings contain invalid entries, including PreToolUse/PermissionRequest
 * hooks that are NOT loaded" ("That hook doesn't run, and when a line lists the source's `hooks`
 * field as ignored, none of that source's hooks run"); settings.md § "Fix a broken settings file"
 * ("Settings Warning: only individual entries fail, such as a malformed permission rule or an
 * unknown hook event name. Claude Code skips those values and keeps the rest of the file in
 * effect"); hooks.md § "Hook handler fields" ("If you define the same handler in more than one
 * settings file, it runs once. A plugin's or skill's copy of the same handler stays separate").
 */
import { describe, expect, test } from 'bun:test';
import {
  createPolicyView,
  type PolicyLayer,
  type PolicyScope,
} from '../../../src/settings/index.ts';
import { spec } from '../../support/spec.ts';
import {
  commandHook,
  issuesOf,
  layerOf,
  plain,
  preToolUse,
} from '../../support/settings-layers.ts';

/** The `hooks` key as the view combines the layers: every file's groups, highest first. */
const mergedHooks = (layers: readonly PolicyLayer[]) => createPolicyView(layers).get('hooks') ?? {};

const BAD = { type: 'teleport', command: 'bad.sh' };

/** One file with a good `Stop` handler and a bad `PreToolUse` one next to a good one. */
const mixed = {
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [BAD, commandHook('good.sh')] }],
    Stop: [{ hooks: [commandHook('stop.sh')] }],
  },
};

const hooksOf = (scope: PolicyScope, raw: unknown): unknown => layerOf(scope, raw).settings.hooks;

spec('settings.key.hooks', () => {
  test('a managed hooks value that is not an object is ignored with an error', () => {
    for (const bad of ['hooks', ['PreToolUse'], 3]) {
      const raw = { hooks: bad };
      expect(hooksOf('managed', raw)).toBeUndefined();
      const reported = issuesOf('managed', raw);
      expect(reported.some((found) => found.severity === 'error')).toBe(true);
      expect(reported.every((found) => found.path.startsWith('managed:hooks'))).toBe(true);
    }
  });

  test('a managed event that is not a list ignores the whole hooks field, good events too', () => {
    const raw = { hooks: { Stop: 'x', PreToolUse: [{ hooks: [commandHook('good.sh')] }] } };
    expect(hooksOf('managed', raw)).toBeUndefined();
    expect(issuesOf('managed', raw).some((found) => found.severity === 'error')).toBe(true);
  });

  test('one bad handler ignores every hook of the managed source', () => {
    expect(hooksOf('managed', mixed)).toBeUndefined();
  });
});

describe('judgment: a source below the policy tier skips only the entries that fail', () => {
  const SOURCES: readonly PolicyScope[] = ['user', 'project', 'local', 'flag'];

  test('one bad handler is dropped with a warning and its neighbours stay', () => {
    for (const scope of SOURCES) {
      expect(plain(hooksOf(scope, mixed))).toEqual({
        PreToolUse: [{ matcher: 'Bash', hooks: [commandHook('good.sh')] }],
        Stop: [{ hooks: [commandHook('stop.sh')] }],
      });
      const reported = issuesOf(scope, mixed);
      expect(reported.map((found) => found.severity)).toEqual(['warning']);
      expect(reported[0]?.path.startsWith(`${scope}:hooks.PreToolUse[0].hooks[0]`)).toBe(true);
      expect(reported[0]?.message).toContain('the entry is skipped');
    }
  });

  test('a group that cannot load is dropped and the other groups of the event stay', () => {
    const raw = {
      hooks: {
        Stop: [{ matcher: 3, hooks: [commandHook('a.sh')] }, { hooks: [commandHook('b.sh')] }],
      },
    };
    expect(plain(hooksOf('user', raw))).toEqual({ Stop: [{ hooks: [commandHook('b.sh')] }] });
  });

  test('an event that is not a list is dropped and the other events stay', () => {
    const raw = { hooks: { Stop: 'x', PreToolUse: [{ hooks: [commandHook('good.sh')] }] } };
    expect(plain(hooksOf('project', raw))).toEqual({
      PreToolUse: [{ hooks: [commandHook('good.sh')] }],
    });
    expect(issuesOf('project', raw).map((found) => found.severity)).toEqual(['warning']);
  });

  test('a hooks value that is not an object leaves nothing to keep, with a warning', () => {
    for (const bad of ['hooks', ['Stop']]) {
      expect(hooksOf('local', { hooks: bad })).toBeUndefined();
      expect(issuesOf('local', { hooks: bad }).map((found) => found.severity)).toEqual(['warning']);
    }
  });

  test('the other keys of the file stay in effect', () => {
    const raw = { ...mixed, disableAllHooks: true };
    expect(layerOf('user', raw).settings.disableAllHooks).toBe(true);
  });

  test('the surviving hooks of a user file still merge under a managed file', () => {
    const merged = mergedHooks([
      layerOf('managed', preToolUse('Bash', 'managed.sh')),
      layerOf('user', mixed),
    ]);
    expect(plain(merged.PreToolUse?.flatMap((group) => group.hooks))).toEqual([
      commandHook('managed.sh'),
      commandHook('good.sh'),
    ]);
  });
});

describe('judgment: what the merged hooks leave to the hooks engine', () => {
  test('the same handler under two matchers that both fire is kept in both groups', () => {
    // hooks.md says the same handler "runs once". `the view's hooks merge` cannot know which groups match an
    // occurrence, so it keeps both groups; dropping the repeat among the groups that matched is an
    // open requirement of the hooks engine (spec/judgments.md, docs/API.md).
    const merged = mergedHooks([
      layerOf('project', preToolUse('Bash', 'shared.sh')),
      layerOf('user', preToolUse('Bash|Edit', 'shared.sh')),
    ]);
    expect(plain(merged.PreToolUse?.flatMap((group) => group.hooks))).toEqual([
      commandHook('shared.sh'),
      commandHook('shared.sh'),
    ]);
  });

  test('a handler of a different matcher that cannot fire together is kept', () => {
    const merged = mergedHooks([
      layerOf('project', preToolUse('Bash', 'shared.sh')),
      layerOf('user', preToolUse('Edit', 'shared.sh')),
    ]);
    expect(merged.PreToolUse).toHaveLength(2);
  });
});
