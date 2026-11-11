/**
 * The SDK's `managedSettings` option (sdk.d.ts: `disableAllHooks: true` "binds as
 * `allowManagedHooksOnly: true`, so the machine administrator's own hooks keep running where the
 * embedder's tier cannot stop them", and "any value but `false` and `"false"` binds it the same
 * way"), settings-reference.md § "What runs under `allowManagedHooksOnly`" (plugin monitors and agent
 * frontmatter hooks are blocked; force-enabled plugins run) and § `disableCommandPluginSources` ("An
 * application that passes `disableAllHooks: true` in the Agent SDK's `managedSettings` option doesn't
 * by itself disable command sources"), claude-apps-gateway.md § "How hook and skill keys in parent
 * settings take effect".
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import {
  forceEnable,
  fromManaged,
  fromPlugin,
  fromPluginFrontmatter,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  managed,
  parent,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const merging = { context: { hasManagedSettings: true, parentMerge: true } } as const;

spec('settings.key.disableAllHooks', () => {
  describe('what follows from the binding as allowManagedHooksOnly', () => {
    const policy = hookPolicyOf(
      [managed({}), forceEnable('vetted@acme'), parent({ disableAllHooks: true })],
      merging,
    );

    test("plugin monitors follow it: only a force-enabled plugin's monitors start", () => {
      expect(policy.monitorsRun('vetted@acme')).toBe(true);
      expect(policy.monitorsRun('vetted@public')).toBe(false);
      expect(policy.monitorsRun('lint@team')).toBe(false);
    });

    test('agent frontmatter hooks of a force-enabled plugin are blocked, a skill one runs', () => {
      expect(runs(policy, fromPluginFrontmatter('skill', 'vetted@acme'))).toBe(true);
      expect(runs(policy, fromPluginFrontmatter('agent', 'vetted@acme'))).toBe(false);
      expect(plain(policy.runs(fromPluginFrontmatter('agent', 'vetted@acme')))).toEqual({
        run: false,
        reason: 'allowManagedHooksOnly',
      });
    });

    test('without the true no monitor is held back', () => {
      const open = hookPolicyOf([managed({}), parent({ disableAllHooks: false })], merging);
      expect(open.monitorsRun('lint@team')).toBe(true);
    });

    // Judgment (spec/judgments.md): the docs say a `disableAllHooks: true` in `managedSettings`
    // "doesn't by itself disable command sources", which wins over the SDK's inference that the
    // binding would also default them off.
    test('command sources stay enabled: the binding is not the key command sources follow', () => {
      const commandPlugin = fromPlugin('built@acme', { commandSource: true });
      const withPlugin = hookPolicyOf(
        [managed({}), forceEnable('built@acme'), parent({ disableAllHooks: true })],
        merging,
      );
      expect(runs(withPlugin, commandPlugin)).toBe(true);
      const alone = hookPolicyOf([parent({ disableAllHooks: true })]);
      expect(plain(alone.runs(fromPlugin('built@acme', { commandSource: true })))).toEqual({
        run: false,
        reason: 'disableAllHooks',
      });
    });

    test('an explicit disableCommandPluginSources: true still disables them', () => {
      const explicit = hookPolicyOf([
        managed({ disableCommandPluginSources: true }),
        forceEnable('built@acme'),
        parent({ disableAllHooks: true }),
      ]);
      expect(plain(explicit.runs(fromPlugin('built@acme', { commandSource: true })))).toEqual({
        run: false,
        reason: 'commandSourceDisabled',
      });
    });
  });

  describe('any value but false and "false" binds as the lock', () => {
    for (const value of ['yes', 'true', 1, 0, {}, []]) {
      test(`${JSON.stringify(value)} is a lock, with a warning`, () => {
        const raw = { disableAllHooks: value };
        expect(issuesOf('parent', raw).map((issue) => issue.severity)).toEqual(['warning']);
        const locked = hookPolicyOf([parent(raw)]);
        expect(runs(locked, fromSettings('user'))).toBe(false);
        expect(runs(locked, fromSdk)).toBe(true);
        expect(locked.commandSettingsNarrowedToManaged).toBe(true);
      });
    }

    test('the text "false" is not a lock, and says to drop the quotes', () => {
      const raw = { disableAllHooks: 'false' };
      expect(issuesOf('parent', raw).map((issue) => issue.severity)).toEqual(['warning']);
      expect(
        runs(hookPolicyOf([parent(raw), user({ disableAllHooks: true })]), fromSettings('user')),
      ).toBe(true);
      expect(runs(hookPolicyOf([parent(raw)]), fromSettings('user'))).toBe(true);
    });

    test('a non-Boolean outside managedSettings is still dropped', () => {
      expect(runs(hookPolicyOf([user({ disableAllHooks: 'yes' })]), fromSettings('user'))).toBe(
        true,
      );
      expect(runs(hookPolicyOf([managed({ disableAllHooks: 'yes' })]), fromManaged)).toBe(true);
    });
  });
});
