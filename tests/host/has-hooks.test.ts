/**
 * `session.hasHooks(event)` (hooks.md, "How a hook resolves", "Disable or remove hooks", "Workspace
 * trust", "Hook locations"): true when at least one registered handler that passes the gates would
 * run for the event, so a host skips building an input nobody reads. Integration tests of the host,
 * outside `spec()`; what it counts where the docs are silent is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, loaded, SESSION, signal, standardPlugins } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

const json = (value: unknown): string => JSON.stringify(value);

describe('session.hasHooks', () => {
  test('is true for the events the enabled plugins hook, false for the others', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    expect(session.hasHooks('PreToolUse')).toBe(true);
    expect(session.hasHooks('PostToolUse')).toBe(true);
    expect(session.hasHooks('Stop')).toBe(false);
  });

  test('the hooks of a disabled plugin do not count', async () => {
    const plugins = await standardPlugins();
    const enabled = plugins.map((plugin) => ({
      ...plugin,
      enabled: plugin.id.startsWith('dormant'),
    }));
    const { host } = await hostOf({ plugins: enabled });
    const session = host.openSession(SESSION);
    expect(session.hasHooks('PreToolUse')).toBe(true);
    expect(session.hasHooks('PostToolUse')).toBe(false);
    const off = await hostOf({ plugins: plugins.map((plugin) => ({ ...plugin, enabled: false })) });
    expect(off.host.openSession(SESSION).hasHooks('PreToolUse')).toBe(false);
  });

  test('disableAllHooks turns every hook off, plugin and registered alike', async () => {
    const settings = createPolicyView([layerOf('user', { disableAllHooks: true })]);
    const { host } = await hostOf({ settings });
    const session = host.openSession(SESSION);
    session.addHooks(
      'agent:a',
      { Stop: [{ hooks: [{ type: 'command', command: './a.sh' }] }] },
      {
        kind: 'agent',
        label: '[agent]',
      },
    );
    expect(session.hasHooks('PreToolUse')).toBe(false);
    expect(session.hasHooks('Stop')).toBe(false);
  });

  test('a hook gated by the turn counts only in the turns that pass the gate', async () => {
    const { host } = await hostOf({ plugins: [] });
    const session = host.openSession(SESSION);
    session.addHooks(
      'agent:p',
      { Stop: [{ hooks: [{ type: 'command', command: './a.sh' }] }] },
      {
        kind: 'agent',
        label: '[agent]',
        scope: 'project',
      },
    );
    expect(session.hasHooks('Stop')).toBe(false);
    expect(session.withTurn({ folderTrustAccepted: true }).hasHooks('Stop')).toBe(true);
  });

  test('settings hooks wait for workspace trust', async () => {
    const settings = createPolicyView([
      layerOf('project', {
        hooks: { Stop: [{ hooks: [{ type: 'command', command: './s.sh' }] }] },
      }),
    ]);
    const untrusted = await hostOf({ plugins: [], settings });
    expect(untrusted.host.openSession({ ...SESSION, trusted: false }).hasHooks('Stop')).toBe(false);
    expect(untrusted.host.openSession(SESSION).hasHooks('Stop')).toBe(true);
  });

  test('a handler counts whatever its matcher says: the occurrence is not known yet', async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': json({ name: 'narrow' }),
      'hooks/hooks.json': json({
        hooks: {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: './w.sh' }] }],
        },
      }),
    });
    const { host, runner } = await hostOf({ plugins: [{ id: 'narrow@acme', plugin }], runs: [{}] });
    const session = host.openSession(SESSION);
    expect(session.hasHooks('PreToolUse')).toBe(true);
    await session.dispatch(
      'PreToolUse',
      { tool_name: 'Bash', tool_input: {}, tool_use_id: 't' },
      {
        signal: signal(),
      },
    );
    expect(runner.calls).toHaveLength(0);
  });

  test('a skill hook counts once the skill is invoked', async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': json({ name: 'guarded' }),
      'skills/secure/SKILL.md':
        '---\ndescription: secure\nhooks:\n  Stop:\n    - hooks:\n        - { type: command, command: ./s.sh }\n---\nGo.',
    });
    const { host } = await hostOf({ plugins: [{ id: 'guarded@acme', plugin }] });
    const session = host.openSession(SESSION);
    expect(session.hasHooks('Stop')).toBe(false);
    await session.expandSkill('guarded:secure', { signal: signal() });
    expect(session.hasHooks('Stop')).toBe(true);
    expect(session.withTurn({ promptId: 'next' }).hasHooks('Stop')).toBe(true);
  });
});
