/**
 * The monitor lifecycle of a session (docs/API.md, "Monitors of a session"): plugins/manifest-reference.md,
 * "monitors" (`when`: "With `"always"`, the default, the monitor starts at session start and on plugin
 * reload. With `"on-skill-invoke:<skill>"`, it starts the first time that skill runs"; the example
 * `"when": "on-skill-invoke:deploy"` "starts the first time the `deploy` skill runs"); plugins/components.md,
 * "Monitors" ("plugin monitors don't start in non-interactive mode"; "if you disable a plugin mid-session,
 * Claude Code doesn't stop monitors that are already running. They stop when the session ends").
 *
 * Judgments J-L10 (the session keeps what it started) and J-L11 (a trigger names the skill bare, as
 * the docs' example, or namespaced) in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { createPluginHost, type PluginHostOptions } from '../../src/host/index.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../support/ports.ts';
import { loaded, SESSION, signal } from '../support/host.ts';

const ID = 'ops@acme-tools';

async function opsPlugin() {
  return loaded({
    '.claude-plugin/plugin.json': JSON.stringify({ name: 'ops' }),
    'skills/deploy/SKILL.md': '---\ndescription: Deploy\n---\nDeploy it.',
    'skills/notes/SKILL.md': '---\ndescription: Notes\n---\nNotes.',
    'monitors/monitors.json': JSON.stringify([
      { name: 'errors', command: 'tail -F "${CLAUDE_PLUGIN_DATA}"/err.log', description: 'Errors' },
      {
        name: 'deploy-status',
        command: '"${CLAUDE_PLUGIN_ROOT}"/poll.sh',
        description: 'Deploy status',
        when: 'on-skill-invoke:deploy',
      },
      {
        name: 'deploy-qualified',
        command: 'echo q',
        description: 'Qualified',
        when: 'on-skill-invoke:ops:deploy',
      },
      {
        name: 'secret',
        command: 'echo ${user_config.token}',
        description: 'Refused',
        when: 'on-skill-invoke:notes',
      },
    ]),
  });
}

async function sessionOf(options: Partial<PluginHostOptions> = {}, interactive = true) {
  const plugin = await opsPlugin();
  const host = createPluginHost({
    plugins: [{ id: ID, plugin }],
    ports: {
      commands: scriptedRunner({}),
      locations: locations(),
      environment: fakeEnvironment({ PATH: '/bin' }),
    },
    ...options,
  });
  return { host, session: host.openSession({ ...SESSION, interactive }) };
}

const names = (resolved: readonly { monitor: { name: string } }[]) =>
  resolved.map((start) => start.monitor.name);

describe('session.monitorsToStart', () => {
  test('at session start: the always monitors, ready to spawn in the session directory', async () => {
    const { session } = await sessionOf();
    const { resolved, issues } = await session.monitorsToStart();
    expect(issues).toEqual([]);
    expect(names(resolved)).toEqual(['errors']);
    const [start] = resolved;
    expect(start?.cwd).toBe(SESSION.cwd);
    expect(start?.monitor).toMatchObject({
      pluginId: ID,
      command: 'tail -F "${CLAUDE_PLUGIN_DATA}"/err.log',
    });
    expect(start?.env['CLAUDE_PLUGIN_DATA']).toBe('/data/ops-acme-tools');
    expect(start?.env['PATH']).toBe('/bin');
  });

  test('each monitor once: the next call starts nothing new', async () => {
    const { session } = await sessionOf();
    await session.monitorsToStart();
    expect((await session.monitorsToStart()).resolved).toEqual([]);
  });

  test('a skill expansion starts the monitors waiting for it, bare and namespaced, the first time only', async () => {
    const { session } = await sessionOf();
    await session.monitorsToStart();
    const expansion = await session.expandSkill('ops:deploy', { signal: signal() });
    expect(expansion.ok).toBe(true);
    expect(names((await session.monitorsToStart()).resolved).toSorted()).toEqual([
      'deploy-qualified',
      'deploy-status',
    ]);
    await session.expandSkill('ops:deploy', { signal: signal() });
    expect((await session.monitorsToStart()).resolved).toEqual([]);
  });

  test('a monitor that must not start is left out with its issue, once', async () => {
    const { session } = await sessionOf();
    await session.monitorsToStart();
    await session.expandSkill('ops:notes', { signal: signal() });
    const first = await session.monitorsToStart();
    expect(first.resolved).toEqual([]);
    expect(first.issues).toHaveLength(1);
    expect(first.issues[0]?.message).toContain('Monitor "secret"');
    expect(await session.monitorsToStart()).toEqual({ resolved: [], issues: [] });
  });

  test('a skill of another plugin with the same name starts nothing', async () => {
    const plugin = await opsPlugin();
    const other = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'tools' }),
      'skills/deploy/SKILL.md': '---\ndescription: Deploy\n---\nDeploy it.',
    });
    const host = createPluginHost({
      plugins: [
        { id: ID, plugin },
        { id: 'tools@acme-tools', plugin: other },
      ],
      ports: {
        commands: scriptedRunner({}),
        locations: locations(),
        environment: fakeEnvironment(),
      },
    });
    const session = host.openSession(SESSION);
    await session.monitorsToStart();
    await session.expandSkill('tools:deploy', { signal: signal() });
    expect((await session.monitorsToStart()).resolved).toEqual([]);
  });

  test('a plugin an update enabled gets its always monitors at the next call', async () => {
    const { host, session } = await sessionOf();
    await session.monitorsToStart();
    const late = await loaded({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'late' }),
      'monitors/monitors.json': JSON.stringify([
        { name: 'errors', command: 'echo late', description: 'Same name, other plugin' },
      ]),
    });
    host.update({
      plugins: [
        { id: ID, plugin: await opsPlugin() },
        { id: 'late@acme-tools', plugin: late },
      ],
    });
    const { resolved } = await session.monitorsToStart();
    expect(resolved.map((start) => [start.monitor.pluginId, start.monitor.name])).toEqual([
      ['late@acme-tools', 'errors'],
    ]);
  });

  test('a non-interactive session starts nothing, skill or not', async () => {
    const { session } = await sessionOf({}, false);
    expect((await session.monitorsToStart()).resolved).toEqual([]);
    await session.expandSkill('ops:deploy', { signal: signal() });
    expect((await session.monitorsToStart()).resolved).toEqual([]);
  });

  test('without feature flags, a host release before 2.1.310 starts nothing', async () => {
    const { session } = await sessionOf();
    const facts = { featureFlagsAvailable: false, version: '2.1.309' };
    expect((await session.monitorsToStart(facts)).resolved).toEqual([]);
  });
});

describe('session.monitorsToStop', () => {
  test('disabling a plugin stops nothing; the session ending stops every started monitor', async () => {
    const { session } = await sessionOf();
    await session.monitorsToStart();
    await session.expandSkill('ops:deploy', { signal: signal() });
    await session.monitorsToStart();
    expect(session.monitorsToStop('plugin-disabled')).toEqual([]);
    expect(
      session
        .monitorsToStop('session-ended')
        .map((id) => `${id.pluginId}/${id.name}`)
        .toSorted(),
    ).toEqual([`${ID}/deploy-qualified`, `${ID}/deploy-status`, `${ID}/errors`]);
    expect(session.monitorsToStop('session-ended')).toEqual([]);
  });
});

describe('a skill that ran outside expandSkill (judgment, spec/judgments.md)', () => {
  test('recordSkillInvocation makes its monitors due, by any name expandSkill takes', async () => {
    const { session } = await sessionOf();
    await session.monitorsToStart();
    expect(session.recordSkillInvocation('ops:deploy')).toBe(true);
    expect(names((await session.monitorsToStart()).resolved).toSorted()).toEqual([
      'deploy-qualified',
      'deploy-status',
    ]);
  });

  test('an unknown name records nothing', async () => {
    const { session } = await sessionOf();
    expect(session.recordSkillInvocation('nope')).toBe(false);
    expect(session.monitorLedger().invoked).toEqual([]);
  });
});

describe('a session reopened over the same chat (judgment, spec/judgments.md)', () => {
  test('continues from the ledger of the one it replaces: nothing starts twice, a skill that ran still counts', async () => {
    const { host, session } = await sessionOf();
    await session.monitorsToStart();
    await session.expandSkill('ops:deploy', { signal: signal() });
    const ledger = session.monitorLedger();
    expect(ledger.started).toEqual([{ pluginId: ID, name: 'errors' }]);
    const reopened = host.openSession({ ...SESSION, monitorLedger: ledger });
    expect(names((await reopened.monitorsToStart()).resolved).toSorted()).toEqual([
      'deploy-qualified',
      'deploy-status',
    ]);
    expect(reopened.monitorsToStop('session-ended')).toHaveLength(3);
  });

  test('the ledger is a copy: the session goes on without changing what was handed out', async () => {
    const { session } = await sessionOf();
    const before = session.monitorLedger();
    await session.monitorsToStart();
    expect(before).toEqual({ invoked: [], started: [] });
    expect(JSON.parse(JSON.stringify(session.monitorLedger()))).toEqual(session.monitorLedger());
  });
});

describe('a subagent\'s session shares its chat session\'s monitors (components.md: a monitor runs "for the whole session")', () => {
  test('a skill the subagent runs starts its monitor once, for the chat; what the chat started is not started again', async () => {
    const { host, session } = await sessionOf();
    expect(names((await session.monitorsToStart()).resolved)).toEqual(['errors']);
    const subagent = host.openSession({
      ...SESSION,
      agent: { id: 'a1', type: 'Explore' },
      parentSession: session,
    });
    expect((await subagent.monitorsToStart()).resolved).toEqual([]);
    await subagent.expandSkill('ops:deploy', { signal: signal() });
    expect(session.monitorLedger().invoked).toHaveLength(1);
    expect(names((await session.monitorsToStart()).resolved).toSorted()).toEqual([
      'deploy-qualified',
      'deploy-status',
    ]);
    expect((await subagent.monitorsToStart()).resolved).toEqual([]);
  });
});
