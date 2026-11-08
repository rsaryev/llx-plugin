/**
 * hooks.md § Disable or remove hooks (`disableAllHooks`, the managed hierarchy), § Workspace trust
 * (settings-file hooks wait for the trust dialog; `-p` and SDK sessions count as trusted), § Hooks in
 * skills and agents (a project skill follows the settings rule; a project subagent needs the dialog
 * for the folder itself, which `-p` never satisfies; user-level agents are exempt) and § Hook
 * locations (a plugin's hooks "when plugin is enabled"). No requirement id covers these rules, so
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
