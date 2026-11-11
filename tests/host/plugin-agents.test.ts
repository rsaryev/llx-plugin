/**
 * plugins/components.md, "Organize agents in subfolders" and "Frontmatter fields in plugin agents":
 * the scoped name of a nested file, the manifest's `agents` field, the fields a plugin agent supports,
 * the ones it ignores, a name over 256 characters and frontmatter that does not parse. End-to-end over
 * the real loader and a session.
 */
import { expect, test } from 'bun:test';
import { HOME, PROJECT, folderHostOf } from '../support/scan.ts';
import { signal } from '../support/host.ts';
import { agentFile, namesOf, pluginOf, reload } from '../support/agent-host.ts';
import { spec } from '../support/spec.ts';

spec('agents.components.Organize agents in subfolders', () => {
  const files = {
    'agents/review/security.md': agentFile('security'),
    'agents/review/renamed.md': agentFile('audit'),
    'agents/top.md': agentFile('top'),
    'custom/review/listed.md': agentFile('listed'),
  };

  test('a file in a subfolder of agents/ loads as <plugin>:<folder>:<file name>', async () => {
    const { session } = folderHostOf({}, { plugins: await pluginOf(files) });
    expect(namesOf(session)).toContain('my-plugin:review:security');
    expect(namesOf(session)).toContain('my-plugin:top');
  });

  test('the frontmatter name replaces only the file name: name: audit in review/renamed.md is my-plugin:review:audit', async () => {
    const { session } = folderHostOf({}, { plugins: await pluginOf(files) });
    expect(namesOf(session)).toContain('my-plugin:review:audit');
    expect(namesOf(session)).not.toContain('my-plugin:review:renamed');
  });

  test('a file the manifest agents field lists loads without subfolder names', async () => {
    const plugins = await pluginOf(files, { agents: './custom/review/listed.md' });
    const { session } = folderHostOf({}, { plugins });
    expect(namesOf(session)).toContain('my-plugin:listed');
    expect(namesOf(session)).not.toContain('my-plugin:review:listed');
  });

  test('the agents manifest key replaces the agents/ scan: the folder is not read when it is set', async () => {
    const plugins = await pluginOf(files, { agents: './custom/review/listed.md' });
    const { session } = folderHostOf({}, { plugins });
    for (const name of ['my-plugin:review:security', 'my-plugin:review:audit', 'my-plugin:top']) {
      expect(namesOf(session)).not.toContain(name);
    }
    const unset = folderHostOf({}, { plugins: await pluginOf(files) });
    expect(namesOf(unset.session)).toContain('my-plugin:top');
  });

  test('the same folders in the personal and project scopes do not become part of the name', async () => {
    const own = {
      [`${HOME}/.claude/agents/review/security.md`]: agentFile('sec'),
    };
    const { session } = folderHostOf(own);
    await reload(session);
    expect(namesOf(session)).toContain('sec');
  });
});

const PLUGIN_AGENT = (front: string): Record<string, string> => ({
  'agents/worker.md': `---\n${front}\n---\nPrompt.\n`,
});

const agentOf = async (files: Record<string, string>) => {
  const { host, session } = folderHostOf({}, { plugins: await pluginOf(files) });
  const { resolved } = await session.agents({ signal: signal(), builtin: false });
  return { agent: resolved[0], resolved, issues: host.issues, session };
};

spec('agents.components.Frontmatter fields in plugin agents.Supported fields', () => {
  test('name, description, model, effort, maxTurns, autoCompactWindow, tools, disallowedTools, skills, memory, background and omitClaudeMd are kept', async () => {
    const { agent } = await agentOf(
      PLUGIN_AGENT(
        [
          'name: worker',
          'description: Works',
          'model: opus',
          'effort: high',
          'maxTurns: 9',
          'autoCompactWindow: 150000',
          'tools: Read, Grep',
          'disallowedTools: Write',
          'skills: [lint]',
          'memory: project',
          'background: true',
          'omitClaudeMd: true',
        ].join('\n'),
      ),
    );
    expect(agent?.name).toBe('my-plugin:worker');
    expect(agent?.definition).toMatchObject({
      description: 'Works',
      model: 'opus',
      effort: 'high',
      maxTurns: 9,
      autoCompactWindow: 150000,
      tools: ['Read', 'Grep'],
      disallowedTools: ['Write'],
      skills: ['lint'],
      memory: 'project',
      background: true,
      omitClaudeMd: true,
    });
  });

  test('isolation, color and the cacheTtl key of experimental are kept as extras', async () => {
    const { agent } = await agentOf(
      PLUGIN_AGENT(
        'name: worker\ndescription: Works\nisolation: worktree\ncolor: cyan\nexperimental:\n  cacheTtl: 1h',
      ),
    );
    expect(agent?.extras).toEqual({ isolation: 'worktree', color: 'cyan', cacheTtl: '1h' });
  });

  test('the only valid isolation value is "worktree"', async () => {
    const { agent, issues } = await agentOf(
      PLUGIN_AGENT('name: worker\ndescription: Works\nisolation: container'),
    );
    expect(agent?.extras.isolation).toBeUndefined();
    expect(issues.some((issue) => issue.message.includes('isolation'))).toBe(true);
  });
});

spec('agents.components.Frontmatter fields in plugin agents.Ignored fields', () => {
  test('permissionMode, hooks, mcpServers and initialPrompt are ignored when the agent comes from a plugin', async () => {
    const { agent, session } = await agentOf(
      PLUGIN_AGENT(
        [
          'name: worker',
          'description: Works',
          'permissionMode: bypassPermissions',
          'initialPrompt: Start now',
          'mcpServers:',
          '  - slack',
          'hooks:',
          '  Stop:',
          '    - hooks:',
          '        - type: command',
          '          command: ./done.sh',
        ].join('\n'),
      ),
    );
    expect(agent?.definition).not.toHaveProperty('permissionMode');
    expect(agent?.definition).not.toHaveProperty('mcpServers');
    expect(agent?.definition).not.toHaveProperty('initialPrompt');
    const entry = session.agentCatalog().agents.find((each) => each.name === 'my-plugin:worker');
    expect(entry?.hooks).toBeUndefined();
  });

  test('the same fields in a project agent file are kept', async () => {
    const { session } = folderHostOf({
      [`${PROJECT}/.claude/agents/worker.md`]:
        '---\nname: worker\ndescription: Works\npermissionMode: plan\ninitialPrompt: Start now\n---\nPrompt.\n',
    });
    await reload(session);
    const { resolved } = await session.agents({ signal: signal(), builtin: false });
    expect(resolved[0]?.definition).toMatchObject({
      permissionMode: 'plan',
      initialPrompt: 'Start now',
    });
  });
});

spec(
  'agents.components.Frontmatter fields in plugin agents.A name longer than 256 characters',
  () => {
    test('Claude Code ignores it and names the agent after its file, as when the field is missing', async () => {
      const long = 'x'.repeat(257);
      const { agent } = await agentOf(PLUGIN_AGENT(`name: ${long}\ndescription: Works`));
      expect(agent?.name).toBe('my-plugin:worker');
      const exact = await agentOf(PLUGIN_AGENT(`name: ${'y'.repeat(256)}\ndescription: Works`));
      expect(exact.agent?.name).toBe(`my-plugin:${'y'.repeat(256)}`);
      const missing = await agentOf(PLUGIN_AGENT('description: Works'));
      expect(missing.agent?.name).toBe('my-plugin:worker');
    });
  },
);

spec(`agents.components.Frontmatter fields in plugin agents.Frontmatter that doesn't parse`, () => {
  test('the agent still loads with every field ignored, named after the file, described "Agent from my-plugin plugin"', async () => {
    const { agent, resolved } = await agentOf(
      PLUGIN_AGENT('name: other\ndescription: "unclosed\nmodel: opus\ntools: Read'),
    );
    expect(resolved).toHaveLength(1);
    expect(agent?.name).toBe('my-plugin:worker');
    expect(agent?.definition).toEqual({
      description: 'Agent from my-plugin plugin',
      prompt: 'Prompt.\n',
    });
  });

  test('in a project agents directory the same file is skipped, not loaded', async () => {
    const { session } = folderHostOf({
      [`${PROJECT}/.claude/agents/worker.md`]:
        '---\nname: other\ndescription: "unclosed\nmodel: opus\n---\nPrompt.\n',
    });
    await reload(session);
    expect(namesOf(session)).not.toContain('other');
    expect(namesOf(session)).not.toContain('worker');
  });
});
