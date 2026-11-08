/**
 * What a hook session reads off the settings (hooks.md, "Disable or remove hooks", "Hook
 * locations"; settings-reference.md, `disableAllHooks`, `allowManagedHooksOnly`,
 * `allowedHttpHookUrls`, `httpHookAllowedEnvVars`, `strictPluginOnlyCustomization`): the same
 * answers the hook policy gives, as the plain data the hook engine's session takes. Integration
 * of the kit's own seam, outside `spec()`: the policy is proven where it is decided.
 */
import { describe, expect, test } from 'bun:test';
import { hookSessionGates } from '../../../src/settings/hooks/index.ts';
import { flag, forceEnable, managed, parent, user } from '../../support/hook-policy.ts';
import { viewOf } from '../../support/plugin-settings.ts';

const PLAIN = { hasManagedSettings: false, parentMerge: false };

const locked = (value: unknown) =>
  hookSessionGates(viewOf(managed({ strictPluginOnlyCustomization: value })), PLAIN)
    .pluginOnlyHooks;

const hooks = (command: string) => ({
  PreToolUse: [{ hooks: [{ type: 'command', command }] }],
});

describe('hookSessionGates', () => {
  test('nothing set leaves every hook on and every list open', () => {
    expect(hookSessionGates(viewOf(), PLAIN)).toMatchObject({
      disableAllHooks: { effective: false, managedLocked: false },
      allowManagedHooksOnly: false,
      pluginOnlyHooks: false,
      httpPolicy: {},
    });
  });

  test('disableAllHooks outside managed settings leaves managed hooks running', () => {
    const gates = hookSessionGates(viewOf(user({ disableAllHooks: true })), PLAIN);
    expect(gates.disableAllHooks).toEqual({ effective: true, managedLocked: false });
  });

  test('disableAllHooks in managed settings turns off the managed hooks too', () => {
    const gates = hookSessionGates(viewOf(managed({ disableAllHooks: true })), PLAIN);
    expect(gates.disableAllHooks).toEqual({ effective: true, managedLocked: true });
  });

  test('a higher file that sets it false wins over a user file that sets it true', () => {
    const gates = hookSessionGates(
      viewOf(user({ disableAllHooks: true }), flag({ disableAllHooks: false })),
      PLAIN,
    );
    expect(gates.disableAllHooks.effective).toBe(false);
  });

  test('allowManagedHooksOnly in managed settings is reported', () => {
    expect(
      hookSessionGates(viewOf(managed({ allowManagedHooksOnly: true })), PLAIN)
        .allowManagedHooksOnly,
    ).toBe(true);
  });

  test('a parent layer that sets disableAllHooks locks both, under the same parent rules', () => {
    const view = viewOf(parent({ disableAllHooks: true }));
    const gates = hookSessionGates(view, { hasManagedSettings: false, parentMerge: false });
    expect(gates.disableAllHooks.effective).toBe(true);
    expect(gates.allowManagedHooksOnly).toBe(true);
  });

  test('strictPluginOnlyCustomization locks hooks as `true` and as a list naming them', () => {
    expect(locked(true)).toBe(true);
    expect(locked(['hooks'])).toBe(true);
    expect(locked(['skills'])).toBe(false);
  });

  test('the HTTP allowlists come through as the engine reads them', () => {
    const gates = hookSessionGates(
      viewOf(
        user({
          allowedHttpHookUrls: ['https://hooks.example/*'],
          httpHookAllowedEnvVars: ['TOKEN'],
        }),
      ),
      PLAIN,
    );
    expect(gates.httpPolicy).toEqual({
      allowedUrls: ['https://hooks.example/*'],
      allowedEnvVars: ['TOKEN'],
    });
  });

  test('forceEnabled names the plugins managed enabledPlugins turns on', () => {
    const gates = hookSessionGates(viewOf(forceEnable('audit@corp')), PLAIN);
    expect(gates.forceEnabled('audit@corp')).toBe(true);
    expect(gates.forceEnabled('audit@other')).toBe(false);
  });

  test('settingsHooks lists the files that declare hooks, highest first', () => {
    const view = viewOf(
      user({ hooks: hooks('./user.sh') }),
      flag({ hooks: hooks('./flag.sh') }),
      user({}),
    );
    expect(hookSessionGates(view, PLAIN).settingsHooks.map((each) => each.scope)).toEqual([
      'flag',
      'user',
    ]);
  });
});
