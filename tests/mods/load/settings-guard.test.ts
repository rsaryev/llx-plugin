/**
 * plugins/mods/reference.md § Settings and environment variables (the table and the two paragraphs
 * under it), plugins/mods/admin.md § Stop user-installed mods from loading, § Know what happens by
 * default, § Choose how much to allow, § Set options on the built-in guard, § Install your
 * organization's mods and set the order, plugins/mods/troubleshoot.md § Refusal messages and §
 * Messages from the built-in guard, plugins/settings-reference.md § `disableAllHooks`,
 * `allowManagedHooksOnly`, plugins/loading.md § Hooks when two enabled plugins share a name.
 */
import { expect, test } from 'bun:test';
import { MOD_SETTINGS } from '../../../src/protocol/mods-settings.ts';
import {
  inline,
  installed,
  managed,
  modPlugin,
  organizations,
  policy,
  session,
} from '../../support/mods-load.ts';
import { codeTokens, sectionsOf, tableRows } from '../../support/mods-docs.ts';
import { spec } from '../../support/spec.ts';

spec('mods.setting.allowManagedModsOnly', () => {
  const registerCalls = (on: unknown): void => void on;

  test("the guard refuses a user's mod, one named with --plugin-dir too, with the documented message; the organization's still run", async () => {
    const settings = managed({
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
      },
    });
    const { host } = session({ first: registerCalls, acme: registerCalls }, { policy: settings });
    const report = await host.load([
      modPlugin(installed('first'), registerCalls),
      modPlugin(organizations('acme'), registerCalls),
      modPlugin(inline('inline-mod'), registerCalls),
    ]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['cc-plugin-sec-default', 'acme']);
    expect(report.lines).toContain(
      "first: refused by cc-plugin-sec-default: mods are limited to your organization's by policy (allowManagedModsOnly)",
    );
  });

  test('only managed settings count: the option in user settings changes nothing', async () => {
    const userSet = policy({
      managed: {},
      user: {
        pluginConfigs: {
          'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
        },
      },
    });
    const { host } = session({ first: registerCalls }, { policy: userSet });
    const report = await host.load([modPlugin(installed('first'), registerCalls)]);
    expect(report.loaded.map((mod) => mod.name)).toContain('first');
  });

  test('the id has one form here: the short id of prependPlugins sets nothing under pluginConfigs', async () => {
    const shortId = managed({
      pluginConfigs: { 'sec-default@builtin': { options: { allowManagedModsOnly: true } } },
    });
    const { host } = session({ first: registerCalls }, { policy: shortId });
    const report = await host.load([modPlugin(installed('first'), registerCalls)]);
    expect(report.loaded.map((mod) => mod.name)).toContain('first');
  });

  test('the guard has to load: with prependPlugins that leaves it out, the option does not apply', async () => {
    const settings = managed({
      prependPlugins: [],
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
      },
    });
    const { host } = session({ first: registerCalls }, { policy: settings });
    const report = await host.load([modPlugin(installed('first'), registerCalls)]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['first']);
  });

  test("the guard fails closed: when it cannot read managed settings it refuses every user's mod", async () => {
    const unreadable = { ...managed(), managedUnreadable: true };
    const { host } = session({ first: registerCalls, acme: registerCalls }, { policy: unreadable });
    const report = await host.load([
      modPlugin(installed('first'), registerCalls),
      modPlugin(organizations('acme'), registerCalls),
    ]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['cc-plugin-sec-default', 'acme']);
    expect(report.lines.join('\n')).toContain('first: refused by cc-plugin-sec-default:');
  });

  test('a session with a Team or Enterprise login has the guard without managed settings; an API key does not', async () => {
    const options = {
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowManagedModsOnly: true } },
      },
    };
    // The option itself needs managed settings, so with a login alone nothing refuses: the guard loads and passes the mod.
    const login = policy({ credential: 'team-or-enterprise-login', user: options });
    const { host } = session({ first: registerCalls }, { policy: login });
    const report = await host.load([modPlugin(installed('first'), registerCalls)]);
    expect(report.loaded.map((mod) => mod.name)).toEqual(['cc-plugin-sec-default', 'first']);
    const apiKey = session({ first: registerCalls }, { policy: policy() });
    const alone = await apiKey.host.load([modPlugin(installed('first'), registerCalls)]);
    expect(alone.loaded.map((mod) => mod.name)).toEqual(['first']);
    // a long-lived OAuth token is not that login, even when one is stored
    const token = session(
      { first: registerCalls },
      { policy: policy({ credential: 'oauth-token' }) },
    );
    expect(
      (await token.host.load([modPlugin(installed('first'), registerCalls)])).loaded.map(
        (mod) => mod.name,
      ),
    ).toEqual(['first']);
  });
});

spec('mods.setting.allowModsToOverrideDenyRules', () => {
  const allowing = (on: (name: string, hook: () => unknown) => unknown): void => {
    on('tool.check', () => ({ decision: 'allow', reason: 'looks fine' }));
  };
  const guardOptions = (overrides: boolean) =>
    managed({
      pluginConfigs: {
        'cc-plugin-sec-default@builtin': { options: { allowModsToOverrideDenyRules: overrides } },
      },
    });
  const check = async (
    settings: ReturnType<typeof guardOptions>,
    verdict: 'deny' | 'ask' | 'none' | 'unknown' | 'throws',
  ) => {
    const s = session(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test's `on` is the hook registration function
      { lifter: (on) => allowing(on as never) },
      {
        policy: settings,
        deny: {
          verdict: () =>
            verdict === 'throws'
              ? Promise.reject(new Error('rules unreadable'))
              : Promise.resolve(verdict),
        },
      },
    );
    await s.host.load([modPlugin(installed('lifter'), (on) => allowing(on as never))]);
    const result = await s.host.fire(
      'tool.check',
      { tool: 'Bash', input: { command: 'rm -rf /' } },
      { core: () => Promise.resolve({ decision: 'ask' }) },
    );
    return { result, debug: s.debug };
  };

  test("by default a user's mod cannot approve a call a deny rule refuses: the call is denied and says so", async () => {
    const { result, debug } = await check(guardOptions(false), 'deny');
    expect(result).toEqual({
      decision: 'deny',
      reason: 'lifter tried to lift a deny rule in your settings',
    });
    expect(debug).toContain('lifter tried to lift a deny rule in your settings');
  });

  test("set to true, a user's mod can approve a call a deny rule refuses", async () => {
    const { result } = await check(guardOptions(true), 'deny');
    expect(result).toEqual({ decision: 'allow', reason: 'looks fine' });
  });

  test("an ask rule still prompts: a user's mod cannot approve what an ask rule prompts for, with or without the option", async () => {
    for (const option of [false, true]) {
      const { result } = await check(guardOptions(option), 'ask');
      expect(result).toMatchObject({ decision: 'deny' });
    }
  });

  test('a call no rule covers is approved as the mod answered', async () => {
    const { result } = await check(guardOptions(false), 'none');
    expect(result).toEqual({ decision: 'allow', reason: 'looks fine' });
  });

  test("the guard fails closed: when the deny rules cannot be checked for a call a user's mod approved, it refuses the call", async () => {
    for (const verdict of ['unknown', 'throws'] as const) {
      const { result } = await check(guardOptions(false), verdict);
      expect(result).toEqual({
        decision: 'deny',
        reason:
          'the deny rules in your settings could not be checked for this call, so it is refused',
      });
    }
  });

  test('it is an option on the guard, read from managed settings only', () => {
    expect(MOD_SETTINGS.allowModsToOverrideDenyRules.homes).toEqual(['guard-option']);
  });
});

test('the settings the kit reads are the ones the reference lists, and no others', () => {
  const rows = tableRows(
    sectionsOf(2).find((section) => section.heading === 'Settings and environment variables')
      ?.lines ?? [],
    'Name',
  );
  const listed = rows.flatMap((row) => codeTokens(row[0] ?? ''));
  expect(Object.keys(MOD_SETTINGS).toSorted()).toEqual([...listed].toSorted());
});
