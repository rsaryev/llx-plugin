/**
 * claude-apps-gateway.md § "How hook and skill keys in parent settings take effect" (keys an
 * application passes in the Agent SDK's `managedSettings` option are parent settings; "On a machine
 * where an administrator deploys managed settings, Claude Code ignores parent settings unless the
 * administrator lets an embedding host add policy"; `disableAllHooks: true` stops user, project, and
 * local hooks, plus hooks declared in agent frontmatter or in the SDK's `settings` option, while the
 * application's SDK hook callbacks and an administrator's managed hooks keep running; `hooks`, or
 * `allowedHttpHookUrls` or `httpHookAllowedEnvVars` with entries are ignored; `allowedHttpHookUrls: []`
 * and `httpHookAllowedEnvVars: []` "take effect unless the administrator defines `hooks` or enables a
 * plugin", and then no HTTP hook runs "except for URLs another settings source lists" and headers
 * "can include only environment variables another settings source lists"), claude-apps-gateway.md §
 * "Set the opt-in" (`parentSettingsBehavior: "merge"`), settings-reference.md § `disableAllHooks` ("In
 * the Agent SDK's `managedSettings` option ... An administrator's managed hooks, force-enabled plugins'
 * hooks, and your SDK hook callbacks keep running"), § `disableCommandPluginSources` ("An application
 * that passes `disableAllHooks: true` in the Agent SDK's `managedSettings` option doesn't by itself
 * disable command sources"), § `allowedHttpHookUrls` and
 * § `httpHookAllowedEnvVars` ("In the Agent SDK's `managedSettings` option, Claude Code ignores a list
 * with entries, so pass it in the SDK's `settings` option instead"), and the SDK's `managedSettings`
 * option (sdk.d.ts: `disableAllHooks: true` "binds as `allowManagedHooksOnly: true`", and "any value
 * but `false` and `"false"` binds it the same way").
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import {
  flag,
  forceEnable,
  fromFrontmatter,
  fromManaged,
  fromPlugin,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  managed,
  parent,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const url = 'https://hooks.example.com/notify';
const merging = { context: { hasManagedSettings: true, parentMerge: true } } as const;
const guarded = { context: { hasManagedSettings: true, parentMerge: false } } as const;

spec(
  [
    'settings.key.disableAllHooks',
    'settings.key.allowedHttpHookUrls',
    'settings.key.httpHookAllowedEnvVars',
  ],
  () => {
    describe('disableAllHooks: true in managedSettings, with no administrator', () => {
      const policy = hookPolicyOf([parent({ disableAllHooks: true })]);

      test('user, project and local hooks stop', () => {
        for (const scope of ['user', 'project', 'local'] as const) {
          expect(plain(policy.runs(fromSettings(scope)))).toEqual({
            run: false,
            reason: 'disableAllHooks',
          });
        }
      });

      test('hooks of the SDK settings option stop, and so do those declared in agent frontmatter', () => {
        expect(runs(policy, fromSettings('sdkSettingsOption'))).toBe(false);
        expect(runs(policy, fromFrontmatter('agent', 'project'))).toBe(false);
        expect(runs(policy, fromFrontmatter('agent', 'user'))).toBe(false);
      });

      test('plugin hooks stop', () => {
        expect(runs(policy, fromPlugin('lint@team'))).toBe(false);
      });

      test('the SDK hook callbacks of the application keep running', () => {
        expect(runs(policy, fromSdk)).toBe(true);
      });
    });

    describe('disableAllHooks: true in managedSettings, with an administrator who lets the host add policy', () => {
      const policy = hookPolicyOf(
        [managed({}), forceEnable('vetted@acme'), parent({ disableAllHooks: true })],
        merging,
      );

      test("an administrator's managed hooks and force-enabled plugin hooks keep running", () => {
        expect(runs(policy, fromManaged)).toBe(true);
        expect(runs(policy, fromPlugin('vetted@acme'))).toBe(true);
        expect(runs(policy, fromSdk)).toBe(true);
      });

      test('user, project and local hooks still stop', () => {
        for (const scope of ['user', 'project', 'local'] as const) {
          expect(runs(policy, fromSettings(scope))).toBe(false);
        }
        expect(runs(policy, fromPlugin('lint@team'))).toBe(false);
      });

      test('the application cannot turn the administrator hooks off, its own true is never managed', () => {
        expect(runs(policy, fromManaged)).toBe(true);
        expect(policy.commandsDisabled.statusLine).toBe(false);
        expect(policy.commandSettingsNarrowedToManaged).toBe(true);
        expect(policy.goalCommandAvailable).toBe(false);
      });
    });

    describe('parent settings on a machine with managed settings', () => {
      test('are ignored unless the administrator opted in: hooks keep running', () => {
        const policy = hookPolicyOf([managed({}), parent({ disableAllHooks: true })], guarded);
        expect(runs(policy, fromSettings('user'))).toBe(true);
        expect(policy.goalCommandAvailable).toBe(true);
      });

      test('a managed layer counts as an administrator even when the host did not say so', () => {
        const policy = hookPolicyOf([managed({}), parent({ disableAllHooks: true })]);
        expect(runs(policy, fromSettings('user'))).toBe(true);
      });

      test('are read with parentSettingsBehavior merge', () => {
        const policy = hookPolicyOf([managed({}), parent({ disableAllHooks: true })], merging);
        expect(runs(policy, fromSettings('user'))).toBe(false);
      });

      test('are read on a machine with no managed settings, whatever the opt-in says', () => {
        const policy = hookPolicyOf([parent({ disableAllHooks: true })]);
        expect(runs(policy, fromSettings('user'))).toBe(false);
      });

      test('an ignored empty allowlist blocks nothing', () => {
        const policy = hookPolicyOf(
          [managed({}), parent({ allowedHttpHookUrls: [], httpHookAllowedEnvVars: [] })],
          guarded,
        );
        expect(plain(policy.httpHook(url, ['TOKEN']))).toEqual({
          run: true,
          interpolate: ['TOKEN'],
        });
      });
    });

    describe('managed settings rank above the parent, but a parent true is a lock', () => {
      // The SDK's `managedSettings` option: `disableAllHooks: true` "binds as `allowManagedHooksOnly:
      // true`", so a `disableAllHooks: false` in managed settings cannot lift it.
      test("an administrator's false does not lift a true in managedSettings", () => {
        const policy = hookPolicyOf(
          [managed({ disableAllHooks: false }), parent({ disableAllHooks: true })],
          merging,
        );
        expect(runs(policy, fromSettings('user'))).toBe(false);
        expect(runs(policy, fromSettings('project'))).toBe(false);
        expect(runs(policy, fromManaged)).toBe(true);
        expect(runs(policy, fromSdk)).toBe(true);
      });

      test('the parent true beats a user file false', () => {
        const policy = hookPolicyOf([
          user({ disableAllHooks: false }),
          parent({ disableAllHooks: true }),
        ]);
        expect(runs(policy, fromSettings('user'))).toBe(false);
      });

      test('--settings ranks below the parent', () => {
        const policy = hookPolicyOf([
          flag({ disableAllHooks: false }),
          parent({ disableAllHooks: true }),
        ]);
        expect(runs(policy, fromSettings('user'))).toBe(false);
      });

      test('a false in managedSettings is an ordinary value: it ranks over a user true', () => {
        const policy = hookPolicyOf([
          user({ disableAllHooks: true }),
          parent({ disableAllHooks: false }),
        ]);
        expect(runs(policy, fromSettings('user'))).toBe(true);
        expect(policy.commandSettingsNarrowedToManaged).toBe(false);
      });

      test('a managed true still disables the managed hooks next to the parent', () => {
        const policy = hookPolicyOf(
          [managed({ disableAllHooks: true }), parent({ disableAllHooks: true })],
          merging,
        );
        expect(plain(policy.runs(fromManaged))).toEqual({ run: false, reason: 'disableAllHooks' });
        expect(policy.commandsDisabled.statusLine).toBe(true);
      });
    });

    describe('keys with entries are ignored in managedSettings', () => {
      test('allowedHttpHookUrls with entries is ignored with a warning: use the SDK settings option', () => {
        const raw = { allowedHttpHookUrls: ['https://a.test/*'] };
        expect(issuesOf('parent', raw).map((issue) => issue.severity)).toEqual(['warning']);
        expect(hookPolicyOf([parent(raw)]).httpHook(url, []).run).toBe(true);
      });

      test('httpHookAllowedEnvVars with entries is ignored', () => {
        const raw = { httpHookAllowedEnvVars: ['ONLY'] };
        expect(issuesOf('parent', raw)).toHaveLength(1);
        expect(plain(hookPolicyOf([parent(raw)]).httpHook(url, ['OTHER']))).toEqual({
          run: true,
          interpolate: ['OTHER'],
        });
      });

      test('hooks is ignored', () => {
        const raw = { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'x' }] }] } };
        expect(issuesOf('parent', raw)).toHaveLength(1);
      });
    });

    describe('an empty list in managedSettings', () => {
      test('allowedHttpHookUrls [] blocks every HTTP hook', () => {
        const policy = hookPolicyOf([parent({ allowedHttpHookUrls: [] })]);
        expect(policy.httpHook(url, []).run).toBe(false);
      });

      test('allowedHttpHookUrls [] lets through the URLs another settings source lists', () => {
        const policy = hookPolicyOf([
          parent({ allowedHttpHookUrls: [] }),
          user({ allowedHttpHookUrls: ['https://mine.test/*'] }),
        ]);
        expect(policy.httpHook('https://mine.test/x', []).run).toBe(true);
        expect(policy.httpHook(url, []).run).toBe(false);
      });

      test('httpHookAllowedEnvVars [] leaves only the variables another settings source lists', () => {
        const alone = hookPolicyOf([parent({ httpHookAllowedEnvVars: [] })]);
        expect(plain(alone.httpHook(url, ['TOKEN']))).toEqual({ run: true, interpolate: [] });
        const withUser = hookPolicyOf([
          parent({ httpHookAllowedEnvVars: [] }),
          user({ httpHookAllowedEnvVars: ['MINE'] }),
        ]);
        expect(plain(withUser.httpHook(url, ['TOKEN', 'MINE']))).toEqual({
          run: true,
          interpolate: ['MINE'],
        });
      });

      test('takes effect on a machine whose administrator defines no hooks and enables no plugin', () => {
        const policy = hookPolicyOf([managed({}), parent({ allowedHttpHookUrls: [] })], merging);
        expect(policy.httpHook(url, []).run).toBe(false);
      });

      test('is not applied when the administrator defines hooks', () => {
        const hooks = { PreToolUse: [{ hooks: [{ type: 'http', url }] }] };
        const policy = hookPolicyOf(
          [managed({ hooks }), parent({ allowedHttpHookUrls: [], httpHookAllowedEnvVars: [] })],
          merging,
        );
        expect(plain(policy.httpHook(url, ['TOKEN']))).toEqual({
          run: true,
          interpolate: ['TOKEN'],
        });
      });

      test('is not applied when the administrator enables a plugin', () => {
        const policy = hookPolicyOf(
          [
            forceEnable('vetted@acme'),
            parent({ allowedHttpHookUrls: [], httpHookAllowedEnvVars: [] }),
          ],
          merging,
        );
        expect(plain(policy.httpHook(url, ['TOKEN']))).toEqual({
          run: true,
          interpolate: ['TOKEN'],
        });
      });

      test('an administrator who only disables a plugin has not enabled one', () => {
        const policy = hookPolicyOf(
          [managed({ enabledPlugins: { 'off@acme': false } }), parent({ allowedHttpHookUrls: [] })],
          merging,
        );
        expect(policy.httpHook(url, []).run).toBe(false);
      });

      test("the administrator's own list still applies next to it", () => {
        const policy = hookPolicyOf(
          [
            managed({
              hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] },
              allowedHttpHookUrls: ['https://a.test/*'],
            }),
            parent({ allowedHttpHookUrls: [] }),
          ],
          merging,
        );
        expect(policy.httpHook('https://a.test/x', []).run).toBe(true);
        expect(policy.httpHook('https://b.test/x', []).run).toBe(false);
      });
    });
  },
);
