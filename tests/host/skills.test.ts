/**
 * What a session lists and expands (skills.md, "Skill descriptions are cut short", "Control who
 * invokes a skill", "Override skill visibility from settings", "Inject dynamic context";
 * plugins/components.md, "Skills"; plugins/manifest-reference.md, "Environment variables"):
 * namespaced `<plugin>:<skill>`, the two invocation flags, `skillOverrides` leaving plugin skills
 * alone, `$ARGUMENTS` and `${CLAUDE_PLUGIN_ROOT}` substituted, shell placeholders through the
 * runner. End-to-end over the real loader, the real skills module and the fakes of the ports:
 * integration tests of the host, outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION, signal } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';

describe('session.skills()', () => {
  test('lists every skill and command of the enabled plugins as <plugin>:<name>', async () => {
    const { host } = await hostOf();
    const { model, menu } = host.openSession(SESSION).skills();
    expect(model.entries.map((entry) => entry.name)).toEqual([
      'formatter:internal',
      'formatter:review',
      'formatter:status',
      'formatter:db:migrate',
    ]);
    expect(menu.map((entry) => entry.name).toSorted()).toEqual([
      'formatter:db:migrate',
      'formatter:release',
      'formatter:review',
      'formatter:status',
    ]);
  });

  test('the model sees the description, the menu the description and the argument hint', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    expect(session.skills().model.entries[1]).toEqual({
      name: 'formatter:review',
      description: 'Review a path against the team rules',
    });
    expect(session.skills().menu.find((entry) => entry.name === 'formatter:review')).toEqual({
      name: 'formatter:review',
      description: 'Review a path against the team rules',
      argumentHint: '<path>',
    });
  });

  test('disable-model-invocation hides a skill from the model, user-invocable: false from the menu', async () => {
    const { host } = await hostOf();
    const { model, menu } = host.openSession(SESSION).skills();
    expect(model.entries.map((entry) => entry.name)).not.toContain('formatter:release');
    expect(menu.map((entry) => entry.name)).toContain('formatter:release');
    expect(model.entries.map((entry) => entry.name)).toContain('formatter:internal');
    expect(menu.map((entry) => entry.name)).not.toContain('formatter:internal');
  });

  test('a disabled plugin lists nothing', async () => {
    const { host } = await hostOf();
    const names = host
      .openSession(SESSION)
      .skills()
      .menu.map((entry) => entry.name);
    expect(names.some((name) => name.startsWith('dormant:'))).toBe(false);
  });

  test('skillOverrides does not touch a plugin skill', async () => {
    const settings = createPolicyView([
      layerOf('user', { skillOverrides: { 'formatter:review': 'off', review: 'off' } }),
    ]);
    const { host } = await hostOf({ settings });
    const names = host
      .openSession(SESSION)
      .skills()
      .model.entries.map((entry) => entry.name);
    expect(names).toContain('formatter:review');
  });
});

describe('session.expandSkill()', () => {
  test('substitutes $ARGUMENTS and ${CLAUDE_PLUGIN_ROOT}', async () => {
    const { host } = await hostOf();
    const result = await host
      .openSession(SESSION)
      .expandSkill('formatter:review', { arguments: 'src/', signal: signal() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(
      'Review src/ using the rules in /plugins/formatter@acme-tools/rules.md.',
    );
  });

  test('runs a shell placeholder through the runner the host gave, with the permission it gave', async () => {
    const { host, runner } = await hostOf({ runs: [{ stdout: 'main\n' }] });
    const asked: string[] = [];
    const permitted = host.openSession({
      ...SESSION,
      permissions: (call) => {
        asked.push(call.command);
        return 'allow';
      },
    });
    const result = await permitted.expandSkill('formatter:status', {
      arguments: '',
      signal: signal(),
    });
    expect(asked).toEqual(['git rev-parse --abbrev-ref HEAD']);
    expect(runner.calls).toHaveLength(1);
    expect(result.ok && result.text).toBe('Branch: main');
  });

  test('without a permission answer a shell placeholder is not run', async () => {
    const { host, runner } = await hostOf();
    const result = await host
      .openSession(SESSION)
      .expandSkill('formatter:status', { arguments: '', signal: signal() });
    expect(result.ok).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  test('disableSkillShellExecution replaces the placeholder and runs nothing', async () => {
    const settings = createPolicyView([layerOf('managed', { disableSkillShellExecution: true })]);
    const { host, runner } = await hostOf({ settings });
    const result = await host
      .openSession(SESSION)
      .expandSkill('formatter:status', { arguments: '', signal: signal() });
    expect(result.ok && result.text).toBe('Branch: [shell command execution disabled by policy]');
    expect(runner.calls).toHaveLength(0);
  });

  test('a command expands like a skill', async () => {
    const { host } = await hostOf();
    const result = await host
      .openSession(SESSION)
      .expandSkill('formatter:db:migrate', { arguments: '', signal: signal() });
    expect(result.ok && result.text).toBe('Migrate the database.');
  });

  test('the model cannot run a skill that disables model invocation; the user can', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    const byModel = await session.expandSkill('formatter:release', {
      arguments: '',
      signal: signal(),
      invoker: 'model',
    });
    expect(byModel.ok).toBe(false);
    expect(byModel.issues[0]?.message).toContain('disable-model-invocation');
    const byUser = await session.expandSkill('formatter:release', {
      arguments: '',
      signal: signal(),
    });
    expect(byUser.ok).toBe(true);
  });

  test('the user cannot type a skill that sets user-invocable: false', async () => {
    const { host } = await hostOf();
    const result = await host
      .openSession(SESSION)
      .expandSkill('formatter:internal', { arguments: '', signal: signal() });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('user-invocable: false');
  });

  test('a skill of a disabled plugin, and an unknown name, are not found', async () => {
    const { host } = await hostOf();
    const session = host.openSession(SESSION);
    for (const name of ['dormant:wake', 'formatter:nope']) {
      const result = await session.expandSkill(name, { arguments: '', signal: signal() });
      expect(result.ok).toBe(false);
      expect(result.issues[0]?.message).toContain(name);
    }
  });
});
