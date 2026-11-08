/**
 * hooks.md § Disable or remove hooks (`disableAllHooks`, the managed hierarchy), § Workspace trust
 * (settings-file hooks wait for the trust dialog; `-p` and SDK sessions count as trusted), § Hooks in
 * skills and agents (a project skill follows the settings rule; a project subagent needs the dialog
 * for the folder itself, which `-p` never satisfies; user-level agents are exempt) and § Hook
 * locations (a plugin's hooks "when plugin is enabled", `allowManagedHooksOnly`) and § Limits on skill
 * hooks (the `strictPluginOnlyCustomization` hooks lock). No requirement id covers these rules, so
 * the tests sit outside `spec(...)`; how the host names the states is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { HookSource } from '../../../src/hooks/contracts.ts';
import {
  agentSource,
  command,
  entry,
  FACTS,
  managedSettings,
  pluginSource,
  projectSettings,
  select,
  session,
  settingsSource,
  skillSource,
} from '../../support/hooks-select.ts';

const ran = (source: HookSource, hookSession = session()): boolean =>
  select([entry('PreToolUse', { source })], 'PreToolUse', FACTS.PreToolUse, {
    session: hookSession,
  }).selected.length === 1;

describe('disableAllHooks', () => {
  const user = { disableAllHooks: { effective: true, managedLocked: false } };
  const managed = { disableAllHooks: { effective: true, managedLocked: true } };

  test('turns off every hook that is not managed', () => {
    for (const source of [settingsSource, projectSettings, pluginSource(), skillSource]) {
      expect(ran(source, session(user))).toBe(false);
    }
  });

  test('cannot turn off managed hooks when it is set in user, project or local settings', () => {
    expect(ran(managedSettings, session(user))).toBe(true);
  });

  test('set at the managed level, it turns off managed hooks too', () => {
    expect(ran(managedSettings, session(managed))).toBe(false);
    expect(ran(settingsSource, session(managed))).toBe(false);
  });

  test('when not set, hooks run', () => {
    expect(ran(settingsSource)).toBe(true);
  });
});

describe('workspace trust', () => {
  const untrusted = session({ trusted: false });

  test('hooks from every settings file, the user own included, wait for trust', () => {
    expect(ran(settingsSource, untrusted)).toBe(false);
    expect(ran(projectSettings, untrusted)).toBe(false);
    expect(ran(settingsSource, session({ trusted: true }))).toBe(true);
  });

  test('a project skill follows the same rule; other skills and plugins do not wait', () => {
    expect(ran(skillSource, untrusted)).toBe(false);
    expect(ran({ ...skillSource, scope: 'user' }, untrusted)).toBe(true);
    expect(ran(pluginSource(), untrusted)).toBe(true);
  });

  test('a project subagent needs the dialog for the folder itself; trusted alone is not enough', () => {
    expect(ran(agentSource, session({ trusted: true }))).toBe(false);
    expect(ran(agentSource, session({ trusted: true, folderTrustAccepted: true }))).toBe(true);
  });

  test('a user-level agent runs without it', () => {
    expect(ran({ ...agentSource, scope: 'user' }, untrusted)).toBe(true);
  });
});

describe('plugin enablement', () => {
  test('a hook of a plugin that is not enabled does not run', () => {
    const enabled = session({ enabledPlugins: new Set(['my-plugin']) });
    expect(ran(pluginSource('my-plugin'), enabled)).toBe(true);
    expect(ran(pluginSource('other'), enabled)).toBe(false);
  });

  test('without a list the registry is taken to hold enabled plugins only', () => {
    expect(ran(pluginSource('other'))).toBe(true);
  });
});

const withId = (source: HookSource, pluginId?: string) =>
  entry('PreToolUse', { source, ...(pluginId === undefined ? {} : { pluginId }) });

describe('allowManagedHooksOnly', () => {
  const locked = session({
    allowManagedHooksOnly: true,
    forceEnabledPlugins: new Set(['formatter@acme-tools']),
  });
  const selects = (registered: ReturnType<typeof entry>) =>
    select([registered], 'PreToolUse', FACTS.PreToolUse, { session: locked }).selected.length === 1;

  test('user, project and local settings hooks, other plugins and agent frontmatter are blocked', () => {
    expect(selects(withId(settingsSource))).toBe(false);
    expect(selects(withId(projectSettings))).toBe(false);
    expect(selects(withId(pluginSource('other'), 'other@acme-tools'))).toBe(false);
    expect(selects(withId(agentSource))).toBe(false);
    expect(selects(withId({ ...agentSource, managed: true }))).toBe(false);
  });

  test('managed hooks, the SDK hooks and force-enabled plugin hooks run', () => {
    expect(selects(withId(managedSettings))).toBe(true);
    expect(selects(withId({ kind: 'session', label: '[session]' }))).toBe(true);
    expect(selects(withId(pluginSource('formatter'), 'formatter@acme-tools'))).toBe(true);
  });

  test('a plugin of the same name from another marketplace stays blocked', () => {
    expect(selects(withId(pluginSource('formatter'), 'formatter@other-market'))).toBe(false);
  });

  test('without the setting, nothing of this applies', () => {
    expect(ran(settingsSource)).toBe(true);
    expect(ran(pluginSource('other'))).toBe(true);
  });
});

describe('strictPluginOnlyCustomization locks hooks', () => {
  const locked = session({ pluginOnlyHooks: true });

  test('hooks from user, project and local settings stop; managed settings keep running', () => {
    for (const scope of ['user', 'project', 'local'] as const) {
      expect(ran({ ...settingsSource, scope }, locked)).toBe(false);
    }
    expect(ran(managedSettings, locked)).toBe(true);
  });

  test('plugin hooks and the SDK hooks keep running', () => {
    expect(ran(pluginSource(), locked)).toBe(true);
    expect(ran({ kind: 'session', label: '[session]' }, locked)).toBe(true);
  });

  test('user and project skill and agent frontmatter hooks stop', () => {
    expect(ran(skillSource, locked)).toBe(false);
    expect(ran({ ...skillSource, scope: 'user' }, locked)).toBe(false);
    expect(ran({ ...agentSource, scope: 'user' }, locked)).toBe(false);
  });

  test('a plugin skill, a managed skill and a bundled skill keep their frontmatter hooks', () => {
    expect(
      ran({ kind: 'skill', label: '[skill]', scope: 'project', pluginName: 'p' }, locked),
    ).toBe(true);
    expect(ran({ ...skillSource, managed: true }, locked)).toBe(true);
    expect(ran({ kind: 'skill', label: '[skill]' }, locked)).toBe(true);
  });

  test('without the lock, the same hooks run', () => {
    expect(ran(settingsSource)).toBe(true);
    expect(ran(skillSource)).toBe(true);
  });
});

describe('gated handlers leave the others untouched', () => {
  test('one disabled handler does not hide a neighbour', () => {
    const blocked = entry('PreToolUse', { source: settingsSource, handler: command('./a.sh') });
    const open = entry('PreToolUse', { source: pluginSource(), handler: command('./b.sh') });
    const result = select([blocked, open], 'PreToolUse', FACTS.PreToolUse, {
      session: session({ trusted: false }),
    });
    expect(result.selected).toEqual([open]);
  });
});
