/**
 * settings-reference.md § `allowManagedPermissionRulesOnly` (Scope Managed; "ignores `allow`,
 * `ask`, and `deny` rules in user, project, local, and `--settings` files, ignores `--allowedTools`";
 * parent settings "drop their `allow` rules and `additionalDirectories`, and keeps their `deny` and
 * `ask` rules except `Read` and `Edit` rules whose pattern starts with `!`"; "`--disallowedTools` rules
 * ... still apply"), § `permissions.disableBypassPermissionsMode` ("Claude Code then rejects the
 * `--dangerously-skip-permissions` flag"), § `permissions.blockReadsOutsideWorkingDirectories` and
 * § `permissions.blockWritesOutsideWorkingDirectories` ("A `true` in any file applies"; "`false`: the
 * same as unset; the block still applies if another file sets `true`"), § `disableAutoMode`;
 * settings.md § "Exceptions to managed settings precedence"; managed-settings.md § "Keys that fail
 * closed" ("the string "true" or "false" reads as that Boolean, with a notice"); permissions.md
 * § Managed settings.
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, layerOf, plain } from '../../support/settings-layers.ts';
import { permissionsOf, ruleLines, terminal } from '../../support/permissions-policy.ts';
import { sessionOf } from '../../support/permission-session.ts';
import { resolveSubagentPermissionMode } from '../../../src/agents/subagent-permission.ts';
import { startPermissions } from '../../../src/host/permission-session.ts';
import { matchContext } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';

/** An administrator who opted in to parent settings (`parentSettingsBehavior: "merge"`). */
const merging = { parentMerge: true };

const rules = (allow: string, deny: string) => ({ permissions: { allow: [allow], deny: [deny] } });

spec('permissions.setting.allowManagedPermissionRulesOnly', () => {
  test('is read from managed settings only; a user file is warned about and ignored', () => {
    expect(plain(layerOf('user', { allowManagedPermissionRulesOnly: true }).settings)).toEqual({});
    expect(issuesOf('user', { allowManagedPermissionRulesOnly: true })).toHaveLength(1);
    expect(layerOf('managed', { allowManagedPermissionRulesOnly: true }).settings).toEqual({
      allowManagedPermissionRulesOnly: true,
    });
  });

  test('true: the rules of user, project, local and --settings files are ignored, managed ones stay', () => {
    const policy = permissionsOf([
      ['managed', { allowManagedPermissionRulesOnly: true, ...rules('Bash(m)', 'Bash(md)') }],
      ['flag', rules('Bash(f)', 'Bash(fd)')],
      ['local', rules('Bash(l)', 'Bash(ld)')],
      ['project', rules('Bash(p)', 'Bash(pd)')],
      ['user', rules('Bash(u)', 'Bash(ud)')],
    ]);
    expect(policy.managedRulesOnly).toBe(true);
    expect(ruleLines(policy)).toEqual(['allow:Bash(m)@managed', 'deny:Bash(md)@managed']);
  });

  test('true: ask rules of those files are ignored too', () => {
    const policy = permissionsOf([
      ['managed', { allowManagedPermissionRulesOnly: true }],
      ['user', { permissions: { ask: ['Bash(git push *)'] } }],
    ]);
    expect(ruleLines(policy)).toEqual([]);
  });

  test('true: --allowedTools is ignored and --disallowedTools still applies', () => {
    const policy = permissionsOf([['managed', { allowManagedPermissionRulesOnly: true }]]);
    const session = sessionOf(policy, terminal(), {
      commandLine: { allowed: ['Bash(npm test)'], disallowed: ['Bash(rm *)'] },
    });
    expect(session.context.rules.map((rule) => `${rule.behavior}:${rule.text}`)).toEqual([
      'deny:Bash(rm *)',
    ]);
  });

  test('false and unset: the rules of every file apply beside the managed ones, --allowedTools too', () => {
    for (const managed of [{ allowManagedPermissionRulesOnly: false }, {}]) {
      const policy = permissionsOf([
        ['managed', { ...managed, ...rules('Bash(m)', 'Bash(md)') }],
        ['user', rules('Bash(u)', 'Bash(ud)')],
      ]);
      expect(policy.managedRulesOnly).toBe(false);
      expect(ruleLines(policy)).toHaveLength(4);
      const session = sessionOf(policy, terminal(), { commandLine: { allowed: ['Bash(x)'] } });
      expect(session.context.rules.some((rule) => rule.text === 'Bash(x)')).toBe(true);
    }
  });

  test('the parent settings of an embedding host: allow rules and directories dropped, deny and ask kept', () => {
    const parent = {
      permissions: {
        allow: ['Bash(a)'],
        ask: ['Bash(b)'],
        deny: ['Bash(c)'],
        additionalDirectories: ['/host'],
      },
    };
    const locked = permissionsOf(
      [
        ['managed', { allowManagedPermissionRulesOnly: true }],
        ['parent', parent],
      ],
      merging,
    );
    expect(ruleLines(locked).toSorted()).toEqual(['ask:Bash(b)@parent', 'deny:Bash(c)@parent']);
    expect(locked.additionalDirectories).toEqual([]);
    const open = permissionsOf([['parent', parent]]);
    expect(ruleLines(open)).toHaveLength(3);
    expect(open.additionalDirectories).toEqual([
      { path: '/host', scope: 'parent', repositoryOnly: false },
    ]);
  });

  test('a host cannot carve paths out with a ! rule on Read or Edit, whether or not the key is set', () => {
    const parent = {
      permissions: {
        deny: ['Read(!/work/ok/**)', 'Edit(!/work/ok/**)', 'Bash(!x)'],
        ask: ['Read(!/y)'],
      },
    };
    for (const managed of [{ allowManagedPermissionRulesOnly: true }, {}]) {
      const policy = permissionsOf(
        [
          ['managed', managed],
          ['parent', parent],
        ],
        merging,
      );
      expect(ruleLines(policy)).toEqual(['deny:Bash(!x)@parent']);
    }
  });

  test('unreadable in managed settings it reads as true, and says so', () => {
    const raw = { allowManagedPermissionRulesOnly: 'yes please' };
    expect(layerOf('managed', raw).settings.allowManagedPermissionRulesOnly).toBe(true);
    expect(issuesOf('managed', raw)[0]?.message).toContain('was present but invalid');
    const quoted = { allowManagedPermissionRulesOnly: 'false' };
    expect(layerOf('managed', quoted).settings.allowManagedPermissionRulesOnly).toBe(false);
  });

  test('--disallowedTools still applies when the session was started under the key', () => {
    const policy = permissionsOf([['managed', { allowManagedPermissionRulesOnly: true }]]);
    const started = startPermissions({
      policy,
      start: terminal(),
      paths: matchContext.paths,
      commandLine: { disallowed: ['Bash(rm *)'] },
    });
    expect(started.outcome).toBe('started');
  });
});

describe('permissions.disableBypassPermissionsMode', () => {
  spec('permissions.setting.permissions.disableBypassPermissionsMode', () => {
    test('"disable" in any file locks bypassPermissions: the flag is rejected', () => {
      for (const scope of ['managed', 'flag', 'local', 'project', 'user'] as const) {
        const policy = permissionsOf([
          [scope, { permissions: { disableBypassPermissionsMode: 'disable' } }],
        ]);
        expect(policy.disableBypassPermissionsMode).toBe(true);
        expect(policy.startingMode(terminal({ dangerouslySkipPermissions: true })).outcome).toBe(
          'refused',
        );
        expect(policy.startingMode(terminal({ permissionMode: 'bypassPermissions' })).outcome).toBe(
          'refused',
        );
      }
    });

    test("a user can set it in their own settings to lock themselves out; no file can lift another's lock", () => {
      const policy = permissionsOf([
        ['managed', { permissions: { disableBypassPermissionsMode: 'disable' } }],
        ['user', { permissions: { disableBypassPermissionsMode: 'enable' } }],
      ]);
      expect(policy.disableBypassPermissionsMode).toBe(true);
    });

    test('unset: the flag starts the session in bypassPermissions', () => {
      const start = permissionsOf([]).startingMode(terminal({ dangerouslySkipPermissions: true }));
      expect(start.outcome === 'started' && start.mode).toBe('bypassPermissions');
    });

    test('unreadable in managed settings reads as "disable"; in a user file it is dropped', () => {
      const raw = { permissions: { disableBypassPermissionsMode: true } };
      expect(plain(layerOf('managed', raw).settings.permissions)).toEqual({
        disableBypassPermissionsMode: 'disable',
      });
      expect(plain(layerOf('user', raw).settings.permissions)).toEqual({});
    });

    test("a subagent whose file asks for the mode runs in the session's own mode", () => {
      const policy = permissionsOf([
        ['managed', { permissions: { disableBypassPermissionsMode: 'disable' } }],
      ]);
      const start = policy.startingMode(terminal({ permissionMode: 'default' }));
      expect(start.outcome === 'started' && start.bypassAvailable).toBe(false);
      const main = start.outcome === 'started' ? start.mode : 'plan';
      const agent = resolveSubagentPermissionMode({
        main,
        set: 'bypassPermissions',
        autoAvailable: true,
      });
      expect(agent.mode).toBe('default');
    });
  });
});
