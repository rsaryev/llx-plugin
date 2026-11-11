/**
 * Which plugin a session's agent rows belong to, and the agents a host registers itself (sub-agents.md,
 * "Choose the subagent scope": the `--agents` flag is priority 2, under managed settings and over the
 * project, user and plugin folders; agent-sdk/subagents.md, "Filesystem-based definition": "Programmatically
 * defined agents take precedence over filesystem-based agents with the same name"). The `source` shape
 * is a judgment (spec/judgments.md): the docs name the scope or plugin, not a shape for it.
 */
import { describe, expect, test } from 'bun:test';
import { agentMentions } from '../../src/agents/catalog/invoke.ts';
import { signal } from '../support/host.ts';
import { agentFile, PLUGIN_ID, pluginOf, reload } from '../support/agent-host.ts';
import { HOME, PROJECT, folderHostOf } from '../support/scan.ts';

describe('the source of an agent row (spec/judgments.md)', () => {
  test('a plugin agent names its plugin by the id the host uses, the way a skill row does', async () => {
    const plugins = await pluginOf({
      'agents/helper.md': agentFile('helper'),
      'skills/tidy/SKILL.md': '---\ndescription: Tidy up\n---\nTidy.\n',
    });
    const { session } = folderHostOf({}, { plugins });
    const row = session.agentCatalog().agents.find((agent) => agent.name === 'my-plugin:helper');
    expect(row?.source).toEqual({ kind: 'plugin', pluginId: PLUGIN_ID });
    const skill = session
      .skillCatalog()
      .skills.find((each) => each.invocable.command === 'my-plugin:tidy');
    expect(skill?.source).toEqual({ kind: 'plugin', pluginId: PLUGIN_ID });
    const { resolved } = await session.agents({ signal: signal() });
    expect(resolved.find((agent) => agent.name === 'my-plugin:helper')?.source).toEqual({
      kind: 'plugin',
      pluginId: PLUGIN_ID,
    });
  });

  test('a file agent names its scope folder, a flag agent the flag, a built-in itself', async () => {
    const files = {
      [`${HOME}/.claude/agents/mine.md`]: agentFile('mine'),
      [`${PROJECT}/.claude/agents/ship.md`]: agentFile('ship'),
    };
    const { session } = folderHostOf(files, {
      session: { agents: { flagged: { description: 'From the flag', prompt: '' } } },
    });
    await reload(session);
    const sourceOf = (name: string) =>
      session.agentCatalog().agents.find((agent) => agent.name === name)?.source;
    expect(sourceOf('mine')).toEqual({ kind: 'folder', scope: 'user' });
    expect(sourceOf('ship')).toEqual({ kind: 'folder', scope: 'project' });
    expect(sourceOf('flagged')).toEqual({ kind: 'flag' });
    expect(sourceOf('Explore')).toEqual({ kind: 'builtin' });
  });
});

describe('agents a host registers at run time are the --agents flag (SDK agents option)', () => {
  const registered = {
    deployer: { description: 'Deploys the app', prompt: 'You deploy.' },
    ship: { description: 'The registered ship', prompt: 'Registered.' },
  };
  const files = {
    [`${PROJECT}/.claude/agents/ship.md`]: agentFile('ship'),
    [`${HOME}/.claude/agents/deployer-notes.md`]: agentFile('deployer-notes'),
  };

  test('they win a shared name over a project file, and the mention lookup finds them', async () => {
    const { session } = folderHostOf(files);
    await reload(session);
    const catalog = session.agentCatalog({ flag: registered });
    const ship = catalog.agents.find((agent) => agent.name === 'ship');
    expect(ship?.source).toEqual({ kind: 'flag' });
    expect(ship?.definition.prompt).toBe('Registered.');
    const found = agentMentions('ask @agent-deployer to ship it', catalog);
    expect(found.mentions.map((mention) => mention.agent.name)).toEqual(['deployer']);
    expect(session.selectAgent({ flag: 'deployer' }, { flag: registered }).ok).toBe(true);
  });

  test('session.agents() takes the same overrides, so the registered agents resolve with the rest', async () => {
    const { session } = folderHostOf(files);
    await reload(session);
    const { resolved } = await session.agents({
      signal: signal(),
      builtin: false,
      overrides: { flag: registered },
    });
    expect(resolved.map((agent) => [agent.name, agent.source])).toEqual([
      ['deployer', { kind: 'flag' }],
      ['ship', { kind: 'flag' }],
      ['deployer-notes', { kind: 'folder', scope: 'user' }],
    ]);
    const plain = await session.agents({ signal: signal(), builtin: false });
    expect(plain.resolved.map((agent) => agent.name)).toEqual(['ship', 'deployer-notes']);
  });
});

describe('an ambiguous session agent gives its candidates (spec/judgments.md)', () => {
  test('selectAgent lists the agents a bare name could mean, scoped name first in code-unit order', async () => {
    const one = await pluginOf({ 'agents/reviewer.md': agentFile('reviewer') });
    const other = await pluginOf({ 'agents/reviewer.md': agentFile('reviewer') }, { name: 'zz' });
    const plugins = [...one, ...other.map((each) => ({ ...each, id: 'zz@acme-tools' }))];
    const { session } = folderHostOf({}, { plugins });
    const chosen = session.selectAgent({ flag: 'reviewer' });
    expect(chosen.ok).toBe(false);
    if (chosen.ok) return;
    expect(chosen.candidates.map((agent) => [agent.name, agent.source])).toEqual([
      ['my-plugin:reviewer', { kind: 'plugin', pluginId: PLUGIN_ID }],
      ['zz:reviewer', { kind: 'plugin', pluginId: 'zz@acme-tools' }],
    ]);
    const unknown = session.selectAgent({ flag: 'nobody' });
    expect(!unknown.ok && unknown.candidates).toEqual([]);
  });
});

// oracle 2.1.322 (spec/judgments.md): `--agents '{"ns:name":…}'` lists `ns:name`; `--agent ns:name`
// and `--agent name` run it; a user agent named `solo` wins `--agent solo` over a flag `ns:solo`.
describe('a host agent registered under a namespace (oracle 2.1.322, spec/judgments.md)', () => {
  const definition = { description: 'Registered by an extension', prompt: 'Ext.' };

  test('it is listed by its whole name, chosen by it or by its bare name, and mentioned by it', () => {
    const { session } = folderHostOf({});
    const flag = { 'ext:deployer': definition };
    const catalog = session.agentCatalog({ flag });
    const row = catalog.agents.find((agent) => agent.name === 'ext:deployer');
    expect([row?.ownName, row?.source]).toEqual(['deployer', { kind: 'flag' }]);
    const scoped = session.selectAgent({ flag: 'ext:deployer' }, { flag });
    expect(scoped.ok && scoped.agent?.name).toBe('ext:deployer');
    const bare = session.selectAgent({ flag: 'deployer' }, { flag });
    expect(bare.ok && bare.agent?.name).toBe('ext:deployer');
    const found = agentMentions('ask @agent-ext:deployer to ship', catalog);
    expect(found.mentions.map((mention) => mention.agent.name)).toEqual(['ext:deployer']);
  });

  test('an exact name of another source wins its bare name', async () => {
    const { session } = folderHostOf({ [`${HOME}/.claude/agents/solo.md`]: agentFile('solo') });
    await reload(session);
    const chosen = session.selectAgent({ flag: 'solo' }, { flag: { 'ns:solo': definition } });
    expect(chosen.ok && chosen.agent?.name).toBe('solo');
  });
});
