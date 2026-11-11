/**
 * A session's subagent catalog (sub-agents.md, "Choose the subagent scope", "Built-in subagents",
 * "Disable specific subagents"; plugins/components.md, "Agents", "Organize agents in subfolders" and
 * "Frontmatter fields in plugin agents"): the built-ins, the `--agents` flag, the managed, project,
 * personal and added folders and the plugins' agents side by side, resolved by priority.
 * End-to-end over the real loader, the scan and the fakes of the ports.
 */
import { describe, expect, test } from 'bun:test';
import { selectSessionAgent } from '../../src/agents/catalog/invoke.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { signal } from '../support/host.ts';
import { agentFile, namesOf, PLUGIN_ID, pluginOf, reload } from '../support/agent-host.ts';
import { HOME, MANAGED, PROJECT, folderHostOf } from '../support/scan.ts';
import { layerOf } from '../support/settings-layers.ts';
import { parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';
import { tierOf } from '../support/agent-catalog.ts';

describe('a session reads the agent folders, the flag, the plugins and the built-ins', () => {
  test('before the first reload only the built-ins, the flag and the plugins are listed; the folders come with it', async () => {
    const files = {
      [`${HOME}/.claude/agents/mine.md`]: agentFile('mine'),
      [`${PROJECT}/.claude/agents/ship.md`]: agentFile('ship'),
      [`${MANAGED}/.claude/agents/policy.md`]: agentFile('policy'),
    };
    const { session } = folderHostOf(files, {
      session: { agents: { flagged: { description: 'From the flag', prompt: 'Flag.' } } },
      plugins: await pluginOf({ 'agents/helper.md': agentFile('helper') }),
    });
    expect(namesOf(session)).not.toContain('mine');
    expect(namesOf(session)).toContain('flagged');
    expect(namesOf(session)).toContain('my-plugin:helper');
    expect(namesOf(session)).toContain('Explore');
    const outcome = await reload(session);
    expect(outcome).toMatchObject({ issues: [] });
    for (const name of ['mine', 'ship', 'policy']) expect(namesOf(session)).toContain(name);
  });

  test('without a folder-scan port the folders are not read, and the session says so', async () => {
    const { session } = folderHostOf(
      { [`${HOME}/.claude/agents/mine.md`]: agentFile('mine') },
      { withoutFolders: true },
    );
    const outcome = await reload(session);
    expect(outcome.issues.map((issue) => issue.severity)).toEqual(['warning']);
    expect(namesOf(session)).not.toContain('mine');
    expect(namesOf(session)).toContain('general-purpose');
  });

  test('a reload picks up what was added to the folders, as /agents does at the next session', async () => {
    const files: Record<string, string> = {};
    const { session } = folderHostOf(files);
    await reload(session);
    expect(namesOf(session)).not.toContain('late');
    files[`${HOME}/.claude/agents/late.md`] = agentFile('late');
    await reload(session);
    expect(namesOf(session)).toContain('late');
  });

  test('session.agents() lists every catalog agent; the prompt of a file agent is left as written', async () => {
    const files = {
      [`${PROJECT}/.claude/agents/ship.md`]: agentFile(
        'ship',
        '',
        'Keep ${CLAUDE_PLUGIN_ROOT} as is.',
      ),
    };
    const { session } = folderHostOf(files, {
      plugins: await pluginOf({
        'agents/helper.md': agentFile('helper', '', 'Root: ${CLAUDE_PLUGIN_ROOT}'),
      }),
    });
    await reload(session);
    const { resolved } = await session.agents({ signal: signal() });
    const byName = new Map(resolved.map((agent) => [agent.name, agent]));
    expect(byName.get('ship')?.definition.prompt).toBe('Keep ${CLAUDE_PLUGIN_ROOT} as is.\n');
    expect(tierOf(byName.get('ship'))).toBe('project');
    expect(byName.get('my-plugin:helper')?.definition.prompt).toBe(`Root: /plugins/${PLUGIN_ID}\n`);
    expect(tierOf(byName.get('Explore'))).toBe('builtin');
  });

  test('builtin: false leaves the built-ins out, for an SDK that has its own', async () => {
    const { session } = folderHostOf({});
    const { resolved } = await session.agents({ signal: signal(), builtin: false });
    expect(resolved).toEqual([]);
  });

  test('the issues of the flag and of a folder file come back with the reload', async () => {
    const files = { [`${PROJECT}/.claude/agents/half.md`]: '---\nname: half\n---\nBody.\n' };
    const { session } = folderHostOf(files, {
      session: { agents: { '-bad': { description: 'd', prompt: '' } } },
    });
    const outcome = await reload(session);
    expect(outcome.issues.map((issue) => issue.path).toSorted()).toEqual([
      '--agents',
      `${PROJECT}/.claude/agents/half.md`,
    ]);
  });

  test('the added directories are read after the project and their .claude/agents is not watched', async () => {
    const files = { '/shared/.claude/agents/team.md': agentFile('team') };
    const { session } = folderHostOf(files, { session: { addedDirectories: ['/shared'] } });
    const outcome = await reload(session);
    expect(namesOf(session)).toContain('team');
    expect(outcome.watch).toEqual([]);
  });
});

describe('the settings decide', () => {
  test('Agent(name) deny rules of the session switch the subagent off; the rest stay', async () => {
    const { session } = folderHostOf(
      { [`${PROJECT}/.claude/agents/mine.md`]: agentFile('mine') },
      { session: { permissionRules: [parsed('Agent(Explore)'), parsed('Agent(mine)')] } },
    );
    await reload(session);
    const names = namesOf(session);
    expect(names).not.toContain('Explore');
    expect(names).not.toContain('mine');
    expect(names).toContain('Plan');
    expect(
      (await session.agents({ signal: signal() })).resolved.map((agent) => agent.name),
    ).not.toContain('Explore');
  });

  test('CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1 removes Explore and Plan', async () => {
    const { session } = folderHostOf({}, { env: { CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS: '1' } });
    expect(namesOf(session)).not.toContain('Explore');
    expect(namesOf(session)).not.toContain('Plan');
    expect(namesOf(session)).toContain('general-purpose');
  });

  test('CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1 removes all built-ins in a non-interactive session only', async () => {
    const env = { CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1' };
    const headless = folderHostOf({}, { env, session: { interactive: false } });
    expect(namesOf(headless.session)).toEqual([]);
    const interactive = folderHostOf({}, { env });
    expect(namesOf(interactive.session)).toContain('Explore');
  });

  test('strictPluginOnlyCustomization for agents stops the personal, project and added folders, never the managed one', async () => {
    const settings = createPolicyView([
      layerOf('managed', { strictPluginOnlyCustomization: ['agents'] }),
    ]);
    const files = {
      [`${MANAGED}/.claude/agents/policy.md`]: agentFile('policy'),
      [`${HOME}/.claude/agents/mine.md`]: agentFile('mine'),
      [`${PROJECT}/.claude/agents/ship.md`]: agentFile('ship'),
    };
    const { session } = folderHostOf(files, { settings });
    await reload(session);
    const names = namesOf(session);
    expect(names).toContain('policy');
    expect(names).not.toContain('mine');
    expect(names).not.toContain('ship');
    expect(names).toContain('Explore');
  });
});

spec('agents.behavior.Choose the subagent scope.agents/', () => {
  test('the agents/ directory of an enabled plugin loads, under the plugin name; a disabled plugin gives none', async () => {
    const files = { 'agents/helper.md': agentFile('helper') };
    const on = folderHostOf({}, { plugins: await pluginOf(files) });
    expect(namesOf(on.session)).toContain('my-plugin:helper');
    const off = folderHostOf({}, { plugins: await pluginOf(files, {}, false) });
    expect(namesOf(off.session)).not.toContain('my-plugin:helper');
  });

  test('it ranks last: the bare name picks a user agent when both exist, and the plugin agent when it is alone', async () => {
    const plugins = await pluginOf({
      'agents/security-reviewer.md': agentFile('security-reviewer'),
    });
    const alone = folderHostOf({}, { plugins });
    const found = alone.session
      .agentCatalog()
      .agents.find((agent) => agent.ownName === 'security-reviewer');
    expect(found?.name).toBe('my-plugin:security-reviewer');
    const pickedAlone = selectSessionAgent(alone.session.agentCatalog(), {
      flag: 'security-reviewer',
    });
    expect(pickedAlone.ok && pickedAlone.agent?.name).toBe('my-plugin:security-reviewer');
    expect(pickedAlone.ok && tierOf(pickedAlone.agent)).toBe('plugin');
    const files = {
      [`${HOME}/.claude/agents/security-reviewer.md`]: agentFile('security-reviewer'),
    };
    const both = folderHostOf(files, { plugins });
    await reload(both.session);
    const catalog = both.session.agentCatalog();
    expect(namesOf(both.session)).toContain('security-reviewer');
    expect(namesOf(both.session)).toContain('my-plugin:security-reviewer');
    const picked = selectSessionAgent(catalog, { flag: 'security-reviewer' });
    expect(picked.ok && tierOf(picked.agent)).toBe('user');
    expect(picked.ok && picked.agent?.name).toBe('security-reviewer');
    const scoped = selectSessionAgent(catalog, { flag: 'my-plugin:security-reviewer' });
    expect(scoped.ok && tierOf(scoped.agent)).toBe('plugin');
  });
});

describe('a host that rebuilds its run state per run (spec/judgments.md)', () => {
  const files = { [`${PROJECT}/.claude/agents/mine.md`]: agentFile('mine') };

  test('agentCatalog(overrides) takes the deny rules of this run, and the session keeps its own', async () => {
    const { session } = folderHostOf(files, {
      session: { permissionRules: [parsed('Agent(Plan)')] },
    });
    await reload(session);
    const run = session.agentCatalog({ permissionRules: [parsed('Agent(mine)'), parsed('Task')] });
    expect(run.delegation).toBe(false);
    expect(run.agents).toEqual([]);
    const only = session.agentCatalog({ permissionRules: [parsed('Agent(mine)')] });
    expect(only.agents.map((agent) => agent.name)).toContain('Plan');
    expect(only.agents.map((agent) => agent.name)).not.toContain('mine');
    const own = session.agentCatalog();
    expect(own.agents.map((agent) => agent.name)).toContain('mine');
    expect(own.agents.map((agent) => agent.name)).not.toContain('Plan');
  });

  test('the --agents flag of one run replaces the session flag for that call; { flag: undefined } is no flag', async () => {
    const { session } = folderHostOf(files, {
      session: { agents: { first: { description: 'd', prompt: '' } } },
    });
    const names = (overrides?: Parameters<typeof session.agentCatalog>[0]) =>
      session.agentCatalog(overrides).agents.map((agent) => agent.name);
    expect(names()).toContain('first');
    expect(names({ flag: { second: { description: 'd', prompt: '' } } })).toContain('second');
    expect(names({ flag: { second: { description: 'd', prompt: '' } } })).not.toContain('first');
    expect(names({ flag: undefined })).not.toContain('first');
    expect(names({ permissionRules: [] })).toContain('first');
    expect(names()).toContain('first');
  });

  test('reloadAgents(overrides) reports the problems of the flag of this run', async () => {
    const { session } = folderHostOf(files);
    const clean = await session.reloadAgents({ signal: signal() });
    expect(clean.issues).toEqual([]);
    const broken = await session.reloadAgents({
      signal: signal(),
      overrides: { flag: { bad: { prompt: 'no description' } } },
    });
    expect(broken.issues.map((issue) => issue.path)).toEqual(['--agents.bad']);
    expect(session.agentCatalog().agents.map((agent) => agent.name)).toContain('mine');
  });

  test('interactive of one run decides which built-ins that call has', async () => {
    const env = { CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1' };
    const { session } = folderHostOf(files, { env });
    const names = (interactive: boolean) =>
      session.agentCatalog({ interactive }).agents.map((agent) => agent.name);
    expect(names(true)).toContain('Explore');
    expect(names(false)).not.toContain('Explore');
    expect(names(true)).toContain('Explore');
  });

  test('selectAgent finds the session agent in the catalog of this run', async () => {
    const { session } = folderHostOf(files, {
      session: { agents: { flagged: { description: 'd', prompt: '' } } },
    });
    await reload(session);
    const chosen = session.selectAgent({ flag: 'flagged' });
    expect(chosen.ok && tierOf(chosen.agent)).toBe('flag');
    expect(session.selectAgent({ flag: 'flagged' }, { flag: undefined }).ok).toBe(false);
    const withSetting = folderHostOf(files, {
      settings: createPolicyView([layerOf('user', { agent: 'mine' })]),
    }).session;
    await reload(withSetting);
    const setting = withSetting.selectAgent({});
    expect(setting.ok && [setting.agent?.name, setting.from]).toEqual(['mine', 'setting']);
  });
});
