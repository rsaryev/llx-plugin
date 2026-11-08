/**
 * permissions.md § "Permission system" ("When you choose "Yes, and don't ask again" and the approval
 * saves permanently, such as for a Bash command or a WebFetch domain, Claude Code saves the rule to
 * `.claude/settings.local.json` at the root of the git repository, resolved through worktrees to the
 * main checkout ... A file-modification approval isn't saved to the file ... In some cases, such as
 * outside a git repository or on Windows, Claude Code doesn't use the repository root"); settings-
 * reference.md § `allowManagedPermissionRulesOnly` ("hides the always-allow choices in permission
 * prompts, and stops saving new rules").
 */
import { describe, expect, test } from 'bun:test';
import { savedApproval } from '../../src/host/saved-approval.ts';
import type { SettingsLocationsInput } from '../../src/settings/index.ts';
import { permissionsOf } from '../support/permissions-policy.ts';
import { spec } from '../support/spec.ts';

/** A session in `/work/app/packages/web` of the repository at `/work/app`, on a POSIX host. */
const locations = (overrides: Partial<SettingsLocationsInput> = {}): SettingsLocationsInput => ({
  primaryWorkingDirectory: '/work/app/packages/web',
  home: '/home/alice',
  directories: ['/work/app/packages/web', '/work/app/packages', '/work/app', '/work'],
  repositoryRoot: '/work/app',
  windows: false,
  join: (base, relative) => `${base}/${relative}`,
  ...overrides,
});

const open = permissionsOf([]);
const locked = permissionsOf([['managed', { allowManagedPermissionRulesOnly: true }]]);
const LOCAL = '/work/app/.claude/settings.local.json';

describe('where "Yes, and don\'t ask again" saves a rule', () => {
  spec('permissions.behavior.Permission system.Bash commands', () => {
    test('a Bash command is saved to the local file at the repository root, from a subdirectory', () => {
      expect(savedApproval('Bash', open, locations())).toEqual({
        memory: { lifetime: 'repository', keyedBy: 'command' },
        ruleFile: LOCAL,
      });
      expect(savedApproval('PowerShell', open, locations())?.ruleFile).toBe(LOCAL);
    });

    test('where Claude Code does not use the repository root the rule goes next to the shared file', () => {
      const here = '/work/app/packages/web/.claude/settings.local.json';
      expect(savedApproval('Bash', open, locations({ windows: true }))?.ruleFile).toBe(here);
      const { repositoryRoot: _root, ...outside } = locations();
      expect(savedApproval('Bash', open, outside)?.ruleFile).toBe(here);
    });
  });

  spec('permissions.behavior.Permission system.Web fetch', () => {
    test('a WebFetch domain is saved the same way', () => {
      expect(savedApproval('WebFetch', open, locations())?.ruleFile).toBe(LOCAL);
    });
  });

  spec('permissions.behavior.Permission system.Web search', () => {
    test('a WebSearch approval is saved permanently per repository', () => {
      expect(savedApproval('WebSearch', open, locations())?.ruleFile).toBe(LOCAL);
    });
  });

  spec('permissions.behavior.Permission system.File modification', () => {
    test('a file-modification approval lasts the session and is not saved to the file', () => {
      expect(savedApproval('Edit', open, locations())).toEqual({
        memory: { lifetime: 'session', keyedBy: 'none' },
      });
    });
  });

  spec('permissions.behavior.Permission system.Read-only', () => {
    test('a read inside the working directories has nothing to remember or save', () => {
      expect(savedApproval('Read', open, locations())).toEqual({
        memory: { lifetime: 'none', keyedBy: 'none' },
      });
    });
  });

  test('a tool outside the table has no approval to save', () => {
    expect(savedApproval('Skill', open, locations())).toBeUndefined();
  });
});

describe('under allowManagedPermissionRulesOnly', () => {
  spec('permissions.setting.allowManagedPermissionRulesOnly', () => {
    test('the always-allow choices are hidden and no rule is saved', () => {
      for (const tool of ['Bash', 'PowerShell', 'WebFetch', 'WebSearch']) {
        expect(savedApproval(tool, locked, locations())).toEqual({
          memory: { lifetime: 'none', keyedBy: 'none' },
        });
      }
    });

    test('a call that never saved a rule is unchanged', () => {
      expect(savedApproval('Edit', locked, locations())?.memory.lifetime).toBe('session');
    });
  });
});
