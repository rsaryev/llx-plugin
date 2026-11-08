/**
 * settings-reference.md § `hooks` (Scope: "Any file. Hooks merge across files rather than
 * replacing each other, and hooks from managed settings can't be removed from other files"; Type:
 * the five handler types; Default: "unset, so no hooks run") and its example; hooks.md §
 * Configuration, "Hook locations" ("Hook entries merge across settings levels rather than
 * replacing each other: user, project, and local settings add their own hooks without removing
 * managed ones") and "Hook handler fields" ("If you define the same handler in more than one
 * settings file, it runs once"); claude-apps-gateway.md § "How hook and skill keys in parent
 * settings take effect" (`hooks` in parent settings is ignored); permissions.md § "Additional
 * directories grant file access, not configuration" (a `--add-dir` directory carries
 * `enabledPlugins` and `extraKnownMarketplaces` only); errors.md § "Managed settings contain
 * invalid entries, including PreToolUse/PermissionRequest hooks that are NOT loaded".
 * `mergeHooks` combines what the files define; running a hook is the hooks engine's.
 */
import { describe, expect, test } from 'bun:test';
import { mergeHooks, type PolicyScope, type SettingsLayer } from '../../src/settings/index.ts';
import { spec } from '../support/spec.ts';
import { commandHook, issuesOf, layerOf, plain, preToolUse } from '../support/settings-layers.ts';

/** The example of settings-reference.md, `hooks`: a script before every Bash tool call. */
const EXAMPLE = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: '~/.claude/hooks/check-bash.sh' }],
      },
    ],
  },
};

const FILE_SCOPES: readonly PolicyScope[] = ['managed', 'flag', 'local', 'project', 'user'];

/** Every command of a merged `PreToolUse`, flattened, to compare what runs. */
const commands = (scopes: readonly [PolicyScope, unknown][]): unknown =>
  mergeHooks(scopes.map(([scope, raw]) => layerOf(scope, raw))).PreToolUse?.flatMap((group) =>
    group.hooks.map((handler) => ('command' in handler ? handler.command : handler.type)),
  );

spec('settings.key.hooks', () => {
  test('the documented example is read and merged unchanged', () => {
    for (const scope of FILE_SCOPES) {
      expect(plain(mergeHooks([layerOf(scope, EXAMPLE)]))).toEqual(EXAMPLE.hooks);
    }
  });

  test('unset, no hooks run: no layer sets the key, or none at all', () => {
    expect(mergeHooks([])).toEqual({});
    expect(mergeHooks([layerOf('user', {}), layerOf('project', { model: 'opus' })])).toEqual({});
  });

  test('hooks of every file merge instead of replacing each other', () => {
    const result = commands([
      ['user', preToolUse('Bash', 'user.sh')],
      ['project', preToolUse('Bash', 'project.sh')],
      ['local', preToolUse('Edit', 'local.sh')],
    ]);
    expect(plain(result)).toEqual(expect.arrayContaining(['user.sh', 'project.sh', 'local.sh']));
    expect(plain(result)).toHaveLength(3);
  });

  test('events of different files all stay', () => {
    const merged = mergeHooks([
      layerOf('user', { hooks: { Stop: [{ hooks: [commandHook('stop.sh')] }] } }),
      layerOf('project', { hooks: { SessionStart: [{ hooks: [commandHook('start.sh')] }] } }),
    ]);
    expect(Object.keys(merged).toSorted()).toEqual(['SessionStart', 'Stop']);
  });

  test('every file scope the entry allows contributes: managed, --settings, local, project, user', () => {
    for (const scope of FILE_SCOPES) {
      expect(plain(commands([[scope, preToolUse('Bash', `${scope}.sh`)]]))).toEqual([
        `${scope}.sh`,
      ]);
    }
  });

  test('user, project and local settings add hooks without removing managed ones', () => {
    const managed = preToolUse('Bash', 'managed.sh');
    for (const other of ['user', 'project', 'local', 'flag'] as const) {
      const result = commands([
        ['managed', managed],
        [other, preToolUse('Bash', 'other.sh')],
      ]);
      expect(plain(result)).toContain('managed.sh');
      expect(plain(result)).toContain('other.sh');
    }
  });

  test('no other file can remove a managed hook: not by an empty hooks key, not by null, not by an empty event', () => {
    const managed = preToolUse('Bash', 'managed.sh');
    for (const attempt of [
      { hooks: {} },
      { hooks: null },
      { hooks: { PreToolUse: [] } },
      { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } },
    ]) {
      for (const other of ['user', 'project', 'local', 'flag'] as const) {
        expect(
          plain(
            commands([
              [other, attempt],
              ['managed', managed],
            ]),
          ),
        ).toEqual(['managed.sh']);
      }
    }
  });

  test('every handler type of the Type line is kept: command, prompt, agent, http, mcp_tool', () => {
    const handlers = [
      { type: 'command', command: 'check.sh' },
      { type: 'prompt', prompt: 'Is this safe? $ARGUMENTS' },
      { type: 'agent', prompt: 'Verify the tests pass' },
      { type: 'http', url: 'https://example.com/hook' },
      { type: 'mcp_tool', server: 'memory', tool: 'save' },
    ];
    const merged = mergeHooks([layerOf('project', { hooks: { Stop: [{ hooks: handlers }] } })]);
    expect(plain(merged.Stop?.[0]?.hooks)).toEqual(handlers);
  });

  test('the same handler in more than one settings file runs once', () => {
    const merged = mergeHooks([
      layerOf('project', preToolUse('Bash', 'shared.sh')),
      layerOf('user', preToolUse('Bash', 'shared.sh')),
    ]);
    expect(plain(merged.PreToolUse)).toEqual(preToolUse('Bash', 'shared.sh').hooks.PreToolUse);
  });

  test('different handlers of one event are not the same handler', () => {
    expect(
      plain(
        commands([
          ['project', preToolUse('Bash', 'a.sh')],
          ['user', preToolUse('Bash', 'b.sh')],
        ]),
      ),
    ).toEqual(['a.sh', 'b.sh']);
  });

  test('hooks in parent settings are ignored', () => {
    const parent = layerOf('parent', preToolUse('Bash', 'parent.sh'));
    expect(parent.settings.hooks).toBeUndefined();
    expect(
      mergeHooks([parent, layerOf('user', preToolUse('Bash', 'user.sh'))]).PreToolUse,
    ).toHaveLength(1);
    expect(issuesOf('parent', preToolUse('Bash', 'parent.sh')).map((found) => found.path)).toEqual([
      'parent:hooks',
    ]);
  });

  test('a layer that does not carry the key is skipped even when it was built by hand', () => {
    const hand: SettingsLayer = {
      scope: 'parent',
      settings: {
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'parent.sh' }] }],
        },
      },
    };
    expect(mergeHooks([hand])).toEqual({});
  });

  test('settings in a --add-dir directory do not carry hooks', () => {
    expect(layerOf('addDir', preToolUse('Bash', 'dir.sh')).settings).toEqual({});
  });

  test('a hook that cannot load is reported and does not stop the other files', () => {
    const broken = { hooks: { PreToolUse: [{ hooks: [{ type: 'teleport', command: 'x.sh' }] }] } };
    const reported = issuesOf('managed', broken);
    expect(reported.some((found) => found.severity === 'error')).toBe(true);
    expect(reported.every((found) => found.path.startsWith('managed:hooks'))).toBe(true);
    expect(
      plain(
        commands([
          ['managed', broken],
          ['user', preToolUse('Bash', 'user.sh')],
        ]),
      ),
    ).toEqual(['user.sh']);
  });
});

describe('hooks merge: judgments (spec/judgments.md)', () => {
  test('per event the groups of the higher file come first', () => {
    expect(
      plain(
        commands([
          ['user', preToolUse('Bash', 'user.sh')],
          ['managed', preToolUse('Bash', 'managed.sh')],
          ['project', preToolUse('Bash', 'project.sh')],
        ]),
      ),
    ).toEqual(['managed.sh', 'project.sh', 'user.sh']);
  });

  test('the same handler is dropped only from a group with the same matcher', () => {
    expect(
      plain(
        commands([
          ['project', preToolUse('Bash', 'shared.sh')],
          ['user', preToolUse('Edit', 'shared.sh')],
        ]),
      ),
    ).toEqual(['shared.sh', 'shared.sh']);
  });

  test('an omitted matcher, "" and "*" are one group: they all match every occurrence', () => {
    for (const matcher of [undefined, '', '*']) {
      expect(
        plain(
          commands([
            ['project', preToolUse(undefined, 'shared.sh')],
            ['user', preToolUse(matcher, 'shared.sh')],
          ]),
        ),
      ).toEqual(['shared.sh']);
    }
  });

  test('the order of the keys of a handler does not make it another handler', () => {
    const a = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh', timeout: 5 }] }] } };
    const b = { hooks: { Stop: [{ hooks: [{ timeout: 5, command: 'x.sh', type: 'command' }] }] } };
    expect(mergeHooks([layerOf('project', a), layerOf('user', b)]).Stop).toHaveLength(1);
  });

  test('two handlers repeated inside one file both stay: only a second file repeats', () => {
    const twice = { hooks: { Stop: [{ hooks: [commandHook('x.sh'), commandHook('x.sh')] }] } };
    expect(mergeHooks([layerOf('user', twice)]).Stop?.[0]?.hooks).toHaveLength(2);
  });

  test('a group of which only some handlers repeat keeps the others', () => {
    const higher = { hooks: { Stop: [{ hooks: [commandHook('a.sh')] }] } };
    const lower = { hooks: { Stop: [{ hooks: [commandHook('a.sh'), commandHook('b.sh')] }] } };
    const merged = mergeHooks([layerOf('project', higher), layerOf('user', lower)]);
    expect(plain(merged.Stop?.[1]?.hooks)).toEqual([commandHook('b.sh')]);
  });

  test('two managed sources are two files: each repeats the other once', () => {
    const merged = mergeHooks([
      layerOf('managed', preToolUse('Bash', 'a.sh')),
      layerOf('managed', preToolUse('Bash', 'a.sh')),
    ]);
    expect(merged.PreToolUse).toHaveLength(1);
  });

  test('an event named __proto__ stays an event', () => {
    const raw = JSON.parse(
      '{"hooks":{"__proto__":[{"hooks":[{"type":"command","command":"x.sh"}]}]}}',
    );
    expect(Object.keys(mergeHooks([layerOf('user', raw)]))).toEqual(['__proto__']);
  });
});
