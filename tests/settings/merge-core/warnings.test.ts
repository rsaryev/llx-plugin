/**
 * settings.md § Fix a broken settings file ("Settings Warning: only individual entries fail, such as
 * a malformed permission rule or an unknown hook event name. Claude Code skips those values and
 * keeps the rest of the file in effect"); errors.md § Malformed Tool(content) rule (`Invalid
 * permission rule "Bash(ls) x" was skipped: Malformed Tool(content) rule ...`),
 * § `"crossSessionInbound" must be one of "accept", "hold", "refuse"`.
 */
import { describe, expect, test } from 'bun:test';
import { problemKind, type PolicyScope } from '../../../src/settings/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { issuesOf, layerOf, commandHook } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const kinds = (raw: unknown, scope: PolicyScope = 'user') =>
  issuesOf(scope, raw).map((issue) => [issue.severity, problemKind(scope, issue)]);

spec('settingsMerge.settings.Fix a broken settings file.Settings Warning', () => {
  describe('the two examples of the docs: a malformed permission rule and an unknown hook event name', () => {
    test('a malformed permission rule is skipped with the errors.md message and its neighbours stay', () => {
      const raw = { permissions: { allow: ['Bash(', 'Bash(ls) x', 'Bash(ls *)'], deny: ['Read'] } };
      const issues = issuesOf('user', raw);
      expect(issues.map((issue) => [issue.severity, issue.path])).toEqual([
        ['warning', 'user:permissions.allow[0]'],
        ['warning', 'user:permissions.allow[1]'],
      ]);
      expect(issues[1]?.message).toStartWith(
        'Invalid permission rule "Bash(ls) x" was skipped: Malformed Tool(content) rule.',
      );
      expect(kinds(raw)).toEqual([
        ['warning', 'Settings Warning'],
        ['warning', 'Settings Warning'],
      ]);
      const view = createGeneralView([layerOf('user', raw)]);
      expect(view.get('permissions')).toEqual({ allow: ['Bash(ls *)'], deny: ['Read'] });
    });

    test('an unknown hook event name is a warning and the known events keep working', () => {
      const raw = {
        hooks: {
          NotAnEvent: [{ hooks: [commandHook('echo no')] }],
          PreToolUse: [{ matcher: 'Bash', hooks: [commandHook('echo yes')] }],
        },
        model: 'opus',
      };
      expect(kinds(raw)).toEqual([['warning', 'Settings Warning']]);
      const layer = layerOf('user', raw);
      // The hooks reader keeps the unknown name and warns (spec/judgments.md); no event ever fires it.
      expect(layer.settings.hooks?.PreToolUse).toHaveLength(1);
      expect(layer.settings.model).toBe('opus');
    });

    test('a malformed rule in managed settings is reported as managed settings, the rest of the file stays', () => {
      const raw = { permissions: { deny: ['Bash(', 'Bash(rm *)'] } };
      expect(kinds(raw, 'managed')).toEqual([['warning', 'Managed settings']]);
      expect(createGeneralView([layerOf('managed', raw)]).get('permissions')?.deny).toEqual([
        'Bash(rm *)',
      ]);
    });
  });

  describe('a value of the wrong type is dropped on its own', () => {
    test('a quoted Boolean or a number where a string belongs is a warning and no value, the file stays', () => {
      const raw = { spinnerTipsEnabled: 'false', model: 5, enableArtifact: 1, model2: 'kept' };
      const layer = layerOf('user', raw);
      expect(issuesOf('user', raw).map((issue) => issue.path)).toEqual([
        'user:spinnerTipsEnabled',
        'user:model',
        'user:enableArtifact',
      ]);
      const view = createGeneralView([layer]);
      expect(view.get('spinnerTipsEnabled')).toBeUndefined();
      expect(view.get('model')).toBeUndefined();
      expect(layer.settings).toHaveProperty('model2', 'kept');
    });

    test('a value off its list is dropped with a message that lists the values, and a list that is no list is dropped', () => {
      const issues = issuesOf('project', {
        crossSessionInbound: 'maybe',
        availableModels: 'opus',
        permissions: { allow: 'Bash(ls)', additionalDirectories: ['../a', 3] },
      });
      expect(issues.map((issue) => issue.path)).toEqual([
        'project:crossSessionInbound',
        'project:availableModels',
        'project:permissions.allow',
        'project:permissions.additionalDirectories[1]',
      ]);
      expect(issues[0]?.message).toBe(
        '"crossSessionInbound" must be one of "accept", "hold", "refuse"; the key is ignored',
      );
    });

    test('a valid file has no warning', () => {
      expect(
        issuesOf('user', {
          spinnerTipsEnabled: false,
          model: 'opus',
          availableModels: ['opus'],
          maxEffortLevel: 'max',
          permissions: { allow: ['Bash(ls *)', 'mcp__srv__*'], defaultMode: 'plan' },
          env: { A: '1' },
        }),
      ).toEqual([]);
    });

    test('an unreadable allowManagedPermissionRulesOnly in the policy tier reads as true, anywhere else it is dropped', () => {
      const managed = createGeneralView([
        layerOf('managed', { allowManagedPermissionRulesOnly: 'yes' }),
      ]);
      expect(managed.get('allowManagedPermissionRulesOnly')).toBe(true);
      expect(issuesOf('managed', { allowManagedPermissionRulesOnly: 'yes' })[0]?.message).toContain(
        'was present but invalid',
      );
    });
  });
});
