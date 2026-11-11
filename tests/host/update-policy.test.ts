import { bodyOf } from '../support/expand.ts';
/**
 * A policy switched on or off while a session is open applies at its next use (hooks.md, "Disable
 * or remove hooks", "Hook locations"; settings-reference.md, `disableAllHooks`,
 * `allowManagedHooksOnly`, `allowedHttpHookUrls`, `disableSkillShellExecution`): the gates of a
 * session are read from the current settings at each dispatch, not once when it was opened.
 * Integration tests of the host over the standard fixture plugins, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const write = {
  tool_name: 'Write',
  tool_input: { file_path: '/work/app/a.ts' },
  tool_use_id: 't1',
};
const wrote = { ...write, tool_response: {} };

const settingsOf = (...layers: Parameters<typeof layerOf>[]) =>
  createPolicyView(layers.map(([scope, raw]) => layerOf(scope, raw)));

describe('allowManagedHooksOnly switched on mid-session', () => {
  test('the next dispatch runs no plugin hook, and switching it off brings them back', async () => {
    const { host, runner } = await hostOf({ runs: [{}, {}] });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    host.update({ settings: settingsOf(['managed', { allowManagedHooksOnly: true }]) });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
    expect(session.hasHooks('PreToolUse')).toBe(false);
    host.update({ settings: settingsOf() });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(2);
  });

  test('a plugin the same update force-enables in managed settings stays exempt', async () => {
    const { host, web } = await hostOf({ http: [{ status: 200, body: '{}' }] });
    const session = host.openSession(SESSION);
    host.update({
      settings: settingsOf([
        'managed',
        { allowManagedHooksOnly: true, enabledPlugins: { 'audit@acme-tools': true } },
      ]),
    });
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(1);
  });
});

describe('disableAllHooks switched on mid-session', () => {
  test('the next dispatch runs nothing, and clearing it runs the hooks again', async () => {
    const { host, runner, web } = await hostOf({ runs: [{}], http: [{ status: 200, body: '{}' }] });
    const session = host.openSession(SESSION);
    host.update({ settings: settingsOf(['user', { disableAllHooks: true }]) });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(runner.calls).toHaveLength(0);
    expect(web.requests).toHaveLength(0);
    host.update({ settings: settingsOf() });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(1);
  });
});

describe('the other hook gates follow the current settings', () => {
  test('strictPluginOnlyCustomization set mid-session silences the settings hooks, not the plugin ones', async () => {
    const project = {
      hooks: {
        PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './lint.sh' }] }],
      },
    };
    const { host, runner } = await hostOf({
      settings: settingsOf(['project', project]),
      runs: [{}, {}, {}],
    });
    const session = host.openSession(SESSION);
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls).toHaveLength(2);
    host.update({
      settings: settingsOf(
        ['managed', { strictPluginOnlyCustomization: ['hooks'] }],
        ['project', project],
      ),
    });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls.slice(2).map((run) => run.spec.command)).toEqual([
      '${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh',
    ]);
  });

  test('allowedHttpHookUrls set mid-session blocks a URL it does not list', async () => {
    const { host, web } = await hostOf({
      http: [
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
      ],
    });
    const session = host.openSession(SESSION);
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(1);
    host.update({
      settings: settingsOf(['user', { allowedHttpHookUrls: ['https://other.example/*'] }]),
    });
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(1);
  });

  test('parentSettings given mid-session change the gates: an administrator drops the parent layer', async () => {
    const { host, web } = await hostOf({
      settings: settingsOf(['parent', { allowedHttpHookUrls: [] }]),
      http: [{ status: 200, body: '{}' }],
    });
    const session = host.openSession(SESSION);
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(0);
    host.update({ parentSettings: { hasManagedSettings: true, parentMerge: false } });
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(1);
    host.update({ parentSettings: { hasManagedSettings: false, parentMerge: false } });
    await session.dispatch('PostToolUse', wrote, { signal: signal() });
    expect(web.requests).toHaveLength(1);
  });

  test('the hooks of a settings file added mid-session run at the next dispatch', async () => {
    const { host, runner } = await hostOf({ runs: [{}, {}, {}] });
    const session = host.openSession(SESSION);
    host.update({
      settings: settingsOf([
        'project',
        {
          hooks: {
            PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './lint.sh' }] }],
          },
        },
      ]),
    });
    await session.dispatch('PreToolUse', write, { signal: signal() });
    expect(runner.calls.map((run) => run.spec.command).toSorted()).toEqual(
      ['./lint.sh', '${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh'].toSorted(),
    );
  });
});

describe('the skill policy follows the current settings', () => {
  test('disableSkillShellExecution set mid-session replaces the placeholder at the next expansion', async () => {
    const { host, runner } = await hostOf({ runs: [{ stdout: 'main\n' }] });
    const session = host.openSession({ ...SESSION, shellPermission: () => 'allow' });
    const before = await session.expandSkill('formatter:status', { signal: signal() });
    expect(before.ok && bodyOf(before.text)).toBe('Branch: main');
    host.update({ settings: settingsOf(['managed', { disableSkillShellExecution: true }]) });
    const after = await session.expandSkill('formatter:status', { signal: signal() });
    expect(after.ok && bodyOf(after.text)).toBe(
      'Branch: [shell command execution disabled by policy]',
    );
    expect(runner.calls).toHaveLength(1);
  });

  test('a skill the new plugin list drops is unknown to expandMessage at once', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    const before = await session.expandMessage('/formatter:review src/', { signal: signal() });
    expect(before.expansions).toHaveLength(1);
    host.update({ plugins: [] });
    const after = await session.expandMessage('/formatter:review src/', { signal: signal() });
    expect(after.expansions).toHaveLength(0);
  });
});
