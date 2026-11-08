/**
 * settings.md § Lists merge instead of overriding ("combines the lists instead of picking one, so
 * each file can add entries without removing another file's"; `fallbackModel`, `modelPicker`,
 * `availableModels` and `modelSettings` follow their own rules), § Permission rules combine
 * differently than you expected ("Claude Code merges `permissions.allow` across scopes, unless your
 * organization sets `allowManagedPermissionRulesOnly`"), managed-settings.md § Split a file-based
 * policy across teams ("Lists ... combine, with duplicates removed"; "Nested blocks ... merge key by
 * key"); permissions.md § Settings precedence ("if user settings allow a permission and project
 * settings deny it, the deny rule blocks it").
 */
import { describe, expect, test } from 'bun:test';
import { effortLevelFor, permissionRuleLists } from '../../../src/settings/general/index.ts';
import {
  evaluateRules,
  parseRule,
  type PermissionRule,
  type RuleSource,
} from '../../../src/rules/index.ts';
import type { PolicyScope } from '../../../src/settings/index.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { matchContext } from '../../support/rule-context.ts';
import { spec } from '../../support/spec.ts';

const row = (model: string) => ({ options: [{ model }] });

describe('lists combine', () => {
  spec('settingsMerge.settings.Lists merge instead of overriding', () => {
    test('permissions.allow set in two files is the union, the highest file first, with duplicates removed', () => {
      const view = createGeneralView([
        layerOf('user', { permissions: { allow: ['Bash(npm run lint)', 'Bash(git status)'] } }),
        layerOf('project', {
          permissions: { allow: ['Bash(npm run test *)', 'Bash(git status)'] },
        }),
      ]);
      expect(view.get('permissions')?.allow).toEqual([
        'Bash(npm run test *)',
        'Bash(git status)',
        'Bash(npm run lint)',
      ]);
    });

    test('a nested block merges key by key and each key follows the same rules', () => {
      const view = createGeneralView([
        layerOf('user', {
          env: { A: '1', B: 'user' },
          sandbox: { network: { allowedDomains: ['a.example'] } },
        }),
        layerOf('project', {
          env: { B: 'project' },
          sandbox: { network: { allowedDomains: ['b.example'] } },
        }),
      ]);
      expect(view.get('env')).toEqual({ A: '1', B: 'project' });
      expect(view.merged().sandbox).toEqual({
        network: { allowedDomains: ['b.example', 'a.example'] },
      });
    });

    test('the merged settings combine every key by its rule, an unlisted one by the general rule', () => {
      const merged = createGeneralView([
        layerOf('user', {
          model: 'haiku',
          permissions: { deny: ['Read(./.env)'] },
          cleanupPeriodDays: 7,
        }),
        layerOf('local', { model: 'opus', permissions: { deny: ['Read(./.env.*)'] } }),
      ]).merged();
      expect(merged).toEqual({
        model: 'opus',
        permissions: { deny: ['Read(./.env.*)', 'Read(./.env)'] },
        cleanupPeriodDays: 7,
      });
    });

    test('fallbackModel is an ordered chain: the whole value of the highest file that defines it', () => {
      const view = createGeneralView([
        layerOf('user', { fallbackModel: ['sonnet', 'haiku'] }),
        layerOf('project', { fallbackModel: ['opus'] }),
      ]);
      expect(view.get('fallbackModel')).toEqual(['opus']);
    });

    test('modelPicker is never merged: the whole value of the highest of managed, --settings and user, and ignored in project and local', () => {
      const view = createGeneralView([
        layerOf('user', { modelPicker: row('user') }),
        layerOf('project', { modelPicker: row('project') }),
        layerOf('local', { modelPicker: row('local') }),
        layerOf('flag', { modelPicker: row('flag') }),
      ]);
      expect(view.get('modelPicker')).toEqual(row('flag'));
      expect(
        createGeneralView([
          layerOf('user', { modelPicker: row('user') }),
          layerOf('project', { modelPicker: row('project') }),
        ]).get('modelPicker'),
      ).toEqual(row('user'));
      expect(
        createGeneralView([
          layerOf('managed', { modelPicker: row('managed') }),
          layerOf('flag', { modelPicker: row('flag') }),
        ]).get('modelPicker'),
      ).toEqual(row('managed'));
    });

    test('availableModels: the managed list as-is, and the other scopes merge as usual when managed settings define none', () => {
      const managed = createGeneralView([
        layerOf('user', { availableModels: ['opus'] }),
        layerOf('managed', { availableModels: ['sonnet'] }),
      ]);
      expect(managed.get('availableModels')).toEqual(['sonnet']);
      const files = createGeneralView([
        layerOf('user', { availableModels: ['opus', 'sonnet'] }),
        layerOf('project', { availableModels: ['sonnet', 'haiku'] }),
      ]);
      expect(files.get('availableModels')).toEqual(['sonnet', 'haiku', 'opus']);
    });

    test('modelSettings is resolved one model at a time: a model saved in a lower file is not combined with a higher file entry', () => {
      const layers = [
        layerOf('user', {
          modelSettings: {
            'claude-opus-5-5': { effortLevel: 'high' },
            'claude-sonnet-5': { effortLevel: 'low' },
          },
        }),
        layerOf('project', { modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }),
      ];
      expect(effortLevelFor(layers, { model: 'claude-opus-5-5', userLevelApplies: true })).toEqual({
        level: 'medium',
        from: 'project',
      });
      expect(effortLevelFor(layers, { model: 'claude-sonnet-5', userLevelApplies: true })).toEqual({
        level: 'low',
        from: 'user',
      });
    });

    test('a model effortLevel beats the top-level one of the same file, and a managed effortLevel outranks a level saved in user settings', () => {
      const user = layerOf('user', {
        effortLevel: 'low',
        modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } },
      });
      const model = { model: 'claude-opus-5-5', userLevelApplies: true };
      expect(effortLevelFor([user], model)).toEqual({ level: 'xhigh', from: 'user' });
      expect(effortLevelFor([user, layerOf('managed', { effortLevel: 'medium' })], model)).toEqual({
        level: 'medium',
        from: 'managed',
      });
    });

    test('the user file top-level effortLevel does not apply to a model the host says it left behind, a project one applies to every model', () => {
      const user = layerOf('user', { effortLevel: 'high' });
      const project = layerOf('project', { effortLevel: 'low' });
      const newer = { model: 'claude-opus-5-5', userLevelApplies: false };
      expect(effortLevelFor([user], newer)).toBeUndefined();
      expect(effortLevelFor([user, project], newer)).toEqual({ level: 'low', from: 'project' });
    });
  });
});

const SOURCE: { readonly [S in PolicyScope]: RuleSource } = {
  managed: { kind: 'managed' },
  parent: { kind: 'embedder-managed' },
  flag: { kind: 'flag-settings', file: 'settings.json' },
  local: { kind: 'local' },
  project: { kind: 'project' },
  user: { kind: 'user' },
  addDir: { kind: 'project' },
};

/** The rules of the merged lists as the rules module reads them, each tagged with the source of its file. */
function rulesFrom(layers: Parameters<typeof createGeneralView>[0]): readonly PermissionRule[] {
  const lists = permissionRuleLists(createGeneralView(layers), () => true);
  return (['allow', 'ask', 'deny'] as const).flatMap((behavior) =>
    lists[behavior].flatMap((entry) => {
      const parsed = parseRule(entry.rule, { behavior, source: SOURCE[entry.scope] });
      return parsed.rule === undefined ? [] : [parsed.rule];
    }),
  );
}

const TRUSTED = () => true;
const call = (command: string) => ({ toolName: 'Bash', input: { command } });

describe('permission rules across settings files', () => {
  spec('settingsMerge.settings.Permission rules combine differently than you expected', () => {
    test("your organization's allow rules still apply alongside yours", () => {
      const lists = permissionRuleLists(
        createGeneralView([
          layerOf('managed', { permissions: { allow: ['Bash(git status)'] } }),
          layerOf('user', { permissions: { allow: ['Bash(npm run lint)'] } }),
        ]),
        TRUSTED,
      );
      expect(lists.allow.map((entry) => [entry.rule, entry.scope])).toEqual([
        ['Bash(git status)', 'managed'],
        ['Bash(npm run lint)', 'user'],
      ]);
    });

    test('allowManagedPermissionRulesOnly makes managed settings the only source of rules: user, project, local and --settings add none', () => {
      const lists = permissionRuleLists(
        createGeneralView([
          layerOf('managed', {
            allowManagedPermissionRulesOnly: true,
            permissions: { allow: ['Bash(git status)'], deny: ['Read(./.env)'] },
          }),
          layerOf('user', { permissions: { allow: ['Bash(npm run lint)'], deny: ['Bash(rm *)'] } }),
          layerOf('project', { permissions: { allow: ['Bash(make)'] } }),
          layerOf('local', { permissions: { ask: ['Bash(git push *)'] } }),
          layerOf('flag', { permissions: { allow: ['Bash(ls)'] } }),
        ]),
        TRUSTED,
      );
      expect(lists.allow.map((entry) => entry.rule)).toEqual(['Bash(git status)']);
      expect(lists.deny.map((entry) => entry.rule)).toEqual(['Read(./.env)']);
      expect(lists.ask).toEqual([]);
    });

    test('the lock drops the host parent allow rules and keeps its deny and ask rules', () => {
      const lists = permissionRuleLists(
        createGeneralView([
          layerOf('managed', { allowManagedPermissionRulesOnly: true }),
          layerOf('parent', {
            permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm *)'], ask: ['Bash(git push *)'] },
          }),
        ]),
        TRUSTED,
      );
      expect(lists.allow).toEqual([]);
      expect(lists.deny.map((entry) => entry.rule)).toEqual(['Bash(rm *)']);
      expect(lists.ask.map((entry) => entry.rule)).toEqual(['Bash(git push *)']);
    });

    test('without the lock a "Yes, and don\'t ask again" allow in the local file does not outrank an ask rule of the project or managed file', () => {
      const local = layerOf('local', { permissions: { allow: ['Bash(git push *)'] } });
      for (const above of ['project', 'managed'] as const) {
        const rules = rulesFrom([
          local,
          layerOf(above, { permissions: { ask: ['Bash(git push *)'] } }),
        ]);
        expect(evaluateRules(rules, call('git push origin main'), matchContext).behavior).toBe(
          'ask',
        );
      }
    });
  });

  spec('settingsMerge.behavior.Settings precedence', () => {
    test('a deny at one scope blocks an allow at another, in either direction', () => {
      const userAllow = layerOf('user', { permissions: { allow: ['Bash(npm run build)'] } });
      const projectDeny = layerOf('project', { permissions: { deny: ['Bash(npm run build)'] } });
      expect(
        evaluateRules(rulesFrom([userAllow, projectDeny]), call('npm run build'), matchContext)
          .behavior,
      ).toBe('deny');
      const userDeny = layerOf('user', { permissions: { deny: ['Bash(npm run build)'] } });
      const projectAllow = layerOf('project', { permissions: { allow: ['Bash(npm run build)'] } });
      expect(
        evaluateRules(rulesFrom([userDeny, projectAllow]), call('npm run build'), matchContext)
          .behavior,
      ).toBe('deny');
    });

    test('no other level can remove a managed deny, --settings included', () => {
      const lists = permissionRuleLists(
        createGeneralView([
          layerOf('managed', { permissions: { deny: ['Bash(curl *)'] } }),
          layerOf('flag', { permissions: { allow: ['Bash(curl *)'], deny: [] } }),
          layerOf('local', { permissions: { allow: ['Bash(curl *)'] } }),
        ]),
        TRUSTED,
      );
      expect(lists.deny).toEqual([{ rule: 'Bash(curl *)', scope: 'managed' }]);
      const rules = rulesFrom([
        layerOf('managed', { permissions: { deny: ['Bash(curl *)'] } }),
        layerOf('flag', { permissions: { allow: ['Bash(curl *)'] } }),
      ]);
      expect(evaluateRules(rules, call('curl https://example.com'), matchContext).behavior).toBe(
        'deny',
      );
    });

    test('an embedding host supplies managed policy beside managed settings, allow rules included', () => {
      const lists = permissionRuleLists(
        createGeneralView([
          layerOf('parent', { permissions: { allow: ['Bash(ls)'] } }),
          layerOf('managed', { permissions: { deny: ['Bash(rm *)'] } }),
        ]),
        TRUSTED,
      );
      expect(lists.allow).toEqual([{ rule: 'Bash(ls)', scope: 'parent' }]);
      expect(lists.deny).toEqual([{ rule: 'Bash(rm *)', scope: 'managed' }]);
    });
  });
});
