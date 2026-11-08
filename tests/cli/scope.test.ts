/**
 * plugins/cli-reference.md § claude plugin commands ("Scopes": `--scope` takes `user`, `project` or
 * `local` and names the settings file the command writes to; `update` also takes `managed`), each
 * command's `--scope` row (the defaults), § plugin enable (the auto-detect order local, project,
 * user; an override at a scope that takes precedence; the refusal at any other scope), § plugin
 * update (local, project, user, then managed) and § claude plugin marketplace commands (their
 * `--scope` has no `-s`). The requirement ids of those sections belong to the commands' own tests;
 * these tests sit outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  chooseScope,
  detectScope,
  scopeFlagSpelling,
  writeScope,
  type ScopedCommand,
} from '../../src/cli/scope.ts';

describe('the scope a command takes', () => {
  test('install, uninstall, prune and marketplace add default to user', () => {
    for (const command of ['install', 'uninstall', 'prune', 'marketplace-add'] as const) {
      expect(chooseScope(command, undefined)).toEqual({ scope: 'user' });
    }
  });

  test('enable, disable and update detect the scope when it is omitted', () => {
    for (const command of ['enable', 'disable', 'update'] as const) {
      expect(chooseScope(command, undefined)).toEqual({ autoDetect: true });
    }
  });

  test('marketplace remove without --scope removes from every scope', () => {
    expect(chooseScope('marketplace-remove', undefined)).toEqual({ allScopes: true });
  });

  test('user, project and local are accepted by every command', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(chooseScope('install', scope)).toEqual({ scope });
    }
  });

  test('managed is accepted by update only', () => {
    expect(chooseScope('update', 'managed')).toEqual({ scope: 'managed' });
    const others: readonly ScopedCommand[] = ['install', 'uninstall', 'enable', 'disable', 'prune'];
    for (const command of others) {
      expect(chooseScope(command, 'managed')).toHaveProperty('reason');
    }
  });

  test('any other value is a usage error that names the accepted ones', () => {
    const refused = chooseScope('install', 'team');
    expect(refused).toMatchObject({ kind: 'usage-error' });
    expect(JSON.stringify(refused)).toContain('user, project, local');
  });
});

describe('the flag spelling', () => {
  test('plugin commands take -s, --scope; the marketplace commands take --scope only', () => {
    expect(scopeFlagSpelling('install')).toBe('-s, --scope <scope>');
    expect(scopeFlagSpelling('marketplace-add')).toBe('--scope <scope>');
    expect(scopeFlagSpelling('marketplace-remove')).toBe('--scope <scope>');
  });
});

describe('auto-detect', () => {
  test('enable and disable use the first of local, project, user that mentions the plugin', () => {
    expect(detectScope('enable', ['user', 'project'])).toBe('project');
    expect(detectScope('disable', ['user', 'local', 'project'])).toBe('local');
    expect(detectScope('enable', ['user'])).toBe('user');
    expect(detectScope('enable', [])).toBeUndefined();
  });

  test('enable never detects managed: it is not a scope the command writes', () => {
    expect(detectScope('enable', ['managed'])).toBeUndefined();
  });

  test('update checks local, project, user, then managed', () => {
    expect(detectScope('update', ['managed', 'user'])).toBe('user');
    expect(detectScope('update', ['managed'])).toBe('managed');
    expect(detectScope('update', ['managed', 'local', 'user'])).toBe('local');
  });
});

describe('a scope passed where the plugin is declared elsewhere', () => {
  test('the scope that declares it is written as it is', () => {
    expect(writeScope('formatter', 'project', ['project'])).toEqual({
      kind: 'write',
      scope: 'project',
    });
  });

  test('a scope that takes precedence over the declaring one writes an override', () => {
    expect(writeScope('formatter', 'local', ['project'])).toEqual({
      kind: 'override',
      scope: 'local',
    });
  });

  test('any other scope fails with the docs line', () => {
    expect(writeScope('formatter', 'user', ['project'])).toEqual({
      kind: 'refused',
      message:
        'Plugin "formatter" is installed at project scope, not user. Use --scope project or omit --scope to auto-detect.',
    });
  });

  test('the refusal names the scope auto-detect would pick', () => {
    const refused = writeScope('formatter', 'user', ['project', 'local']);
    expect(refused).toMatchObject({ kind: 'refused' });
    expect(JSON.stringify(refused)).toContain('installed at local scope, not user');
  });

  test('a plugin declared nowhere is not installed', () => {
    expect(writeScope('formatter', 'user', [])).toEqual({ kind: 'not-installed' });
  });
});
