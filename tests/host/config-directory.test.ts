/**
 * `CLAUDE_CONFIG_DIR` moves the user scope's folders (env-vars.md: "Override the configuration
 * directory (default: `~/.claude`)... Ignored in project and local settings"; claude-directory.md:
 * "every `~/.claude` path on this page lives under that directory instead"). Probed against Claude
 * Code 2.1.322: with it set, the skills, commands and agents of `~/.claude` are not read and the
 * directory's own are. The host supplies it through its `Environment` port (or the user or managed
 * settings `env`); an extra scope folder of the host stays below the home (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { createPolicyView } from '../../src/settings/index.ts';
import { signal } from '../support/host.ts';
import { agentFile, reload } from '../support/agent-host.ts';
import { HOME, folderHostOf, menuOf, skillText } from '../support/scan.ts';
import { layerOf } from '../support/settings-layers.ts';

const CONFIG = '/cfg';
const FILES = {
  [`${HOME}/.claude/skills/home-skill/SKILL.md`]: skillText('home'),
  [`${HOME}/.claude/commands/home-cmd.md`]: 'Home command.',
  [`${HOME}/.claude/agents/home-agent.md`]: agentFile('home-agent'),
  [`${CONFIG}/skills/config-skill/SKILL.md`]: skillText('config'),
  [`${CONFIG}/commands/config-cmd.md`]: 'Config command.',
  [`${CONFIG}/agents/config-agent.md`]: agentFile('config-agent'),
  [`${CONFIG}/.claude/skills/nested-skill/SKILL.md`]: skillText('not read'),
  [`${HOME}/.agents/skills/extra-skill/SKILL.md`]: skillText('extra'),
};

async function readOf(fixture: Parameters<typeof folderHostOf>[1]) {
  const { session } = folderHostOf(FILES, fixture);
  await session.reloadSkills({ signal: signal() });
  await reload(session);
  const agents = session
    .agentCatalog()
    .agents.filter((agent) => 'scope' in agent.source)
    .map((agent) => agent.name);
  return { menu: menuOf(session), agents };
}

describe('CLAUDE_CONFIG_DIR moves the user scope (env-vars.md, claude-directory.md)', () => {
  test('set, the skills, commands and agents come from the directory itself, not ~/.claude', async () => {
    const read = await readOf({ env: { CLAUDE_CONFIG_DIR: CONFIG } });
    expect(read.menu).toEqual(['config-cmd', 'config-skill']);
    expect(read.agents).toEqual(['config-agent']);
  });

  test('unset or empty, ~/.claude', async () => {
    for (const env of [{}, { CLAUDE_CONFIG_DIR: '' }]) {
      const read = await readOf({ env });
      expect(read.menu).toEqual(['home-cmd', 'home-skill']);
      expect(read.agents).toEqual(['home-agent']);
    }
  });

  test('the user settings env sets it too; a project file’s value is ignored', async () => {
    const user = await readOf({
      settings: createPolicyView([layerOf('user', { env: { CLAUDE_CONFIG_DIR: CONFIG } })]),
    });
    expect(user.agents).toEqual(['config-agent']);
    const project = await readOf({
      settings: createPolicyView([layerOf('project', { env: { CLAUDE_CONFIG_DIR: CONFIG } })]),
    });
    expect(project.agents).toEqual(['home-agent']);
  });

  test('an extra scope folder of the host stays below the home (spec/judgments.md)', async () => {
    const read = await readOf({
      env: { CLAUDE_CONFIG_DIR: CONFIG },
      extraScopeFolders: ['.agents'],
    });
    expect(read.menu).toEqual(['config-cmd', 'config-skill', 'extra-skill']);
  });
});
