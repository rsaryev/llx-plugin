/**
 * settings.md § Keep personal settings out of a repository ("Its allow rules don't wait for trust
 * while the file stays untracked ... If the file is tracked by git, the trust step applies to it
 * too"), § Permission rules combine differently than you expected; permissions.md § When your local
 * settings file needs trust ("When the file is tracked in git, or `.claude` is a symlink, Claude
 * Code treats it as repository-supplied instead and holds its rules until you trust the folder"),
 * § Project allow rules and workspace trust; settings-reference.md § `allowManagedPermissionRulesOnly`
 * ("A host can't carve paths out of the managed rules with a `!` rule, whether or not you set this
 * key"). `permissionRulesOf` is the host API over the lists, not a documented behaviour.
 */
import { describe, expect, test } from 'bun:test';
import { permissionRulesOf } from '../../../src/host/index.ts';
import {
  permissionRuleLists,
  type LocalFileFacts,
  type ScopeTrust,
} from '../../../src/settings/general/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const NOT_TRUSTED: ScopeTrust = () => false;
const TRUSTED: ScopeTrust = () => true;
const UNTRACKED: LocalFileFacts = { tracked: false, claudeDirIsSymlink: false };
const TRACKED: LocalFileFacts = { tracked: true, claudeDirIsSymlink: false };
const SYMLINKED: LocalFileFacts = { tracked: false, claudeDirIsSymlink: true };

const LOCAL = layerOf('local', {
  permissions: {
    allow: ['Bash(make)'],
    additionalDirectories: ['../shared'],
    deny: ['Read(./.env)'],
    ask: ['Bash(git push *)'],
  },
});

describe('the local settings file and the trust step', () => {
  spec(
    [
      'settingsMerge.settings.Permission rules combine differently than you expected',
      'trust.behavior.When your local settings file needs trust',
    ],
    () => {
      test('an untracked local file applies its allow rules and directories without the trust step', () => {
        const lists = permissionRuleLists(createGeneralView([LOCAL]), NOT_TRUSTED, UNTRACKED);
        expect(lists.allow.map((entry) => entry.rule)).toEqual(['Bash(make)']);
        expect(lists.additionalDirectories).toEqual([{ directory: '../shared', scope: 'local' }]);
      });

      for (const [name, facts] of [
        ['tracked in git', TRACKED],
        ['under a symlinked .claude', SYMLINKED],
      ] as const) {
        test(`a local file ${name} is repository-supplied: its allow rules and directories wait for trust, deny and ask apply at once`, () => {
          const view = createGeneralView([LOCAL]);
          const held = permissionRuleLists(view, NOT_TRUSTED, facts);
          expect(held.allow).toEqual([]);
          expect(held.additionalDirectories).toEqual([]);
          expect(held.deny.map((entry) => entry.rule)).toEqual(['Read(./.env)']);
          expect(held.ask.map((entry) => entry.rule)).toEqual(['Bash(git push *)']);
          const trusted = permissionRuleLists(view, TRUSTED, facts);
          expect(trusted.allow.map((entry) => entry.rule)).toEqual(['Bash(make)']);
          expect(trusted.additionalDirectories).toHaveLength(1);
        });
      }

      test('the shared project file waits for trust whatever the local file is', () => {
        const project = layerOf('project', { permissions: { allow: ['Bash(make)'] } });
        const lists = permissionRuleLists(createGeneralView([project]), NOT_TRUSTED, UNTRACKED);
        expect(lists.allow).toEqual([]);
      });

      test('the local file asks the trust answer for its own folder, so a trusted project folder still holds a tracked local file the host did not trust', () => {
        const asked: string[] = [];
        permissionRuleLists(
          createGeneralView([LOCAL]),
          (scope) => {
            asked.push(scope);
            return false;
          },
          TRACKED,
        );
        expect(asked).toContain('local');
      });
    },
  );

  spec('settingsMerge.settings.Permission rules combine differently than you expected', () => {
    test('a host parent `!` carve-out in deny or ask is dropped with or without the lock; the same rule from managed settings stays', () => {
      const parent = layerOf('parent', {
        permissions: { deny: ['Read(!./x)', 'Bash(rm *)'], ask: ['Edit(!./y)'] },
      });
      const managed = layerOf('managed', { permissions: { deny: ['Read(!./z)'] } });
      for (const lock of [false, true]) {
        const lists = permissionRuleLists(
          createGeneralView([
            layerOf('managed', { allowManagedPermissionRulesOnly: lock }),
            parent,
            managed,
          ]),
          TRUSTED,
          UNTRACKED,
        );
        expect(lists.deny.map((entry) => entry.rule)).toEqual(['Read(!./z)', 'Bash(rm *)']);
        expect(lists.ask).toEqual([]);
      }
    });
  });
});

describe('permissionRulesOf', () => {
  const facts = { trusted: TRUSTED, local: UNTRACKED, flagSettings: 'inline' } as const;

  test('parses every rule with the source of its file, deny first', () => {
    const { rules, issues } = permissionRulesOf(
      createGeneralView([
        layerOf('managed', { permissions: { deny: ['Bash(rm *)'] } }),
        layerOf('parent', { permissions: { ask: ['Bash(git push *)'] } }),
        layerOf('flag', { permissions: { allow: ['Bash(ls)'] } }),
        layerOf('local', { permissions: { allow: ['Bash(make)'] } }),
        layerOf('project', { permissions: { allow: ['Bash(npm test)'] } }),
        layerOf('user', { permissions: { allow: ['Bash(git status)'] } }),
      ]),
      facts,
    );
    expect(issues).toEqual([]);
    expect(rules.map((rule) => [rule.behavior, rule.text, rule.source.kind])).toEqual([
      ['deny', 'Bash(rm *)', 'managed'],
      ['ask', 'Bash(git push *)', 'embedder-managed'],
      ['allow', 'Bash(ls)', 'flag-settings'],
      ['allow', 'Bash(make)', 'local'],
      ['allow', 'Bash(npm test)', 'project'],
      ['allow', 'Bash(git status)', 'user'],
    ]);
    expect(rules[2]?.source).toEqual({ kind: 'flag-settings', file: 'inline' });
  });

  test('a rule the parser skips comes back as an issue led by its scope, and the trust answer is read per call', () => {
    const view = createGeneralView([
      layerOf('user', {
        permissions: { allow: ['mcp__srv__tool(arg)'], additionalDirectories: ['/d'] },
      }),
      layerOf('project', { permissions: { allow: ['Bash(make)'] } }),
    ]);
    const held = permissionRulesOf(view, { ...facts, trusted: NOT_TRUSTED });
    expect(held.rules).toEqual([]);
    expect(held.issues.map((issue) => issue.path)).toEqual(['user:permissions.allow']);
    expect(held.directories).toEqual([{ directory: '/d', scope: 'user' }]);
    expect(permissionRulesOf(view, facts).rules.map((rule) => rule.text)).toEqual(['Bash(make)']);
  });
});
