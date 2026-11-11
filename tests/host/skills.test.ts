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
import { bodyOf } from '../support/expand.ts';
import { hostOf, loaded, SESSION, signal } from '../support/host.ts';
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
    // A skill's text opens with its folder (oracle 2.1.319, `bun run oracle:model-content`).
    expect(result.text).toBe(
      'Base directory for this skill: /plugins/formatter@acme-tools/skills/review\n\n' +
        'Review src/ using the rules in /plugins/formatter@acme-tools/rules.md.',
    );
  });

  test('runs a shell placeholder through the runner the host gave, with the permission it gave', async () => {
    const { host, runner } = await hostOf({ runs: [{ stdout: 'main\n' }] });
    const asked: string[] = [];
    const permitted = host.openSession({
      ...SESSION,
      shellPermission: (call) => {
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
    expect(result.ok && bodyOf(result.text)).toBe('Branch: main');
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
    expect(result.ok && bodyOf(result.text)).toBe(
      'Branch: [shell command execution disabled by policy]',
    );
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

describe('a manifest command with an allowedTools rule that does not parse (spec/judgments.md)', () => {
  const entry = { content: 'Go.', allowedTools: ['Bash(git status', 'Read', 'Bash(git diff *)'] };

  test('the host reports it as `loadCommandEntries` does, and keeps the command and the valid rules', async () => {
    const plugin = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({
        name: 'status-tools',
        commands: { status: entry },
      }),
    });
    const { host } = await hostOf({ plugins: [{ id: 'status-tools@acme', plugin }] });
    expect(host.issues).toEqual([
      expect.objectContaining({ severity: 'warning', path: 'commands.status.allowedTools' }),
    ]);
    expect(host.issues[0]?.message).toContain('Bash(git status');
    const run = await host
      .openSession(SESSION)
      .expandSkill('status-tools:status', { signal: signal() });
    expect(run).toMatchObject({ ok: true, grants: ['Read', 'Bash(git diff *)'] });
  });
});

describe('allowManagedPermissionRulesOnly (settings-reference.md; skills.md, "When only managed permission rules apply")', () => {
  const files = {
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'grants' }),
    'skills/commit/SKILL.md':
      '---\ndescription: Commit\nallowed-tools: Read\ndisallowed-tools: Edit\n---\nCommit.',
  };
  const run = async (
    settings: Parameters<typeof createPolicyView>[0],
    source?: 'skills-directory',
  ) => {
    const plugin = await loaded(files);
    const { host } = await hostOf({
      plugins: [{ id: 'grants@acme', plugin, ...(source && { source }) }],
      settings: createPolicyView(settings),
    });
    return host.openSession(SESSION).expandSkill('grants:commit', { signal: signal() });
  };

  test('without the key a plugin skill keeps its allowed-tools grant', async () => {
    expect(await run([])).toMatchObject({ ok: true, grants: ['Read'], disallowed: ['Edit'] });
  });

  test('a plugin installed from a marketplace keeps its grant even when managed settings set the key', async () => {
    const managed = layerOf('managed', { allowManagedPermissionRulesOnly: true });
    expect(await run([managed])).toMatchObject({ ok: true, grants: ['Read'] });
  });

  test('a plugin declared inside the skills folders loses the grant, and its disallowed-tools still applies', async () => {
    const managed = layerOf('managed', { allowManagedPermissionRulesOnly: true });
    expect(await run([managed], 'skills-directory')).toMatchObject({
      ok: true,
      grants: [],
      disallowed: ['Edit'],
    });
  });

  test('the key counts only in managed settings: a user file cannot lock its own skills', async () => {
    const user = layerOf('user', { allowManagedPermissionRulesOnly: true });
    expect(await run([user], 'skills-directory')).toMatchObject({ ok: true, grants: ['Read'] });
  });
});
