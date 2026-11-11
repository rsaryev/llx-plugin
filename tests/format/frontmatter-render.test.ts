/**
 * A skill, command and agent file rendered from the kit's types reads back to the same values
 * (skills.md and sub-agents.md, "Frontmatter reference"). How a file is written the docs do not say:
 * judgment `frontmatterWriter` (spec/judgments.md), so no `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { HooksSettings } from '../../src/protocol/hook-config.ts';
import { readAgent } from '../../src/format/agent.ts';
import { readCommand } from '../../src/format/command.ts';
import {
  renderAgentFile,
  renderCommandFile,
  renderSkillFile,
  type AgentDraft,
  type SkillDraft,
} from '../../src/format/frontmatter-render.ts';
import { parseFrontmatter } from '../../src/format/frontmatter.ts';
import { readSkill } from '../../src/format/skill.ts';

const hooks: HooksSettings = {
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './check.sh' }] }],
};

const skill: SkillDraft = {
  name: 'review',
  description: 'Use when: a diff is ready',
  whenToUse: 'true',
  argumentHint: '[file] [--fast]',
  arguments: ['file', 'mode'],
  disableModelInvocation: true,
  userInvocable: false,
  allowedTools: ['Bash(git diff *)', 'Read'],
  disallowedTools: ['Write'],
  model: 'sonnet',
  effort: 'high',
  context: 'fork',
  agent: 'Explore',
  background: false,
  hooks,
  paths: ['src/**/*.ts', '*.md'],
  shell: 'bash',
  metadata: { owner: 'team', priority: 1 },
  license: 'MIT',
  compatibility: 'claude-code >= 2',
  body: '\n# Review\n\n!`git diff`\n',
};

describe('renderSkillFile', () => {
  test('every field reads back as written, the body included', () => {
    const { skill: read, issues } = readSkill('skills/review/SKILL.md', renderSkillFile(skill), {
      origin: { kind: 'project' },
      dirName: 'review',
    });
    expect(issues).toEqual([]);
    const { body, ...fields } = skill;
    expect(read).toMatchObject({ ...fields, body, shellDeclared: true });
  });

  test('a default is left out, in the table order; shell is kept when given', () => {
    const text = renderSkillFile({
      description: 'd',
      userInvocable: true,
      background: true,
      arguments: [],
      shell: 'bash',
      body: 'B',
      extra: { 'x-host': 1 },
    });
    expect(text).toBe('---\ndescription: d\nshell: bash\nx-host: 1\n---\nB');
  });
});

describe('renderCommandFile', () => {
  test('reads back as the command it was rendered from', () => {
    const { name: _name, paths: _paths, ...draft } = skill;
    const { command } = readCommand('commands/review.md', renderCommandFile(draft), {
      origin: { kind: 'project' },
      relativePath: 'review.md',
    });
    const { body, ...fields } = draft;
    expect(command).toMatchObject({ ...fields, body, name: 'review' });
  });
});

describe('renderAgentFile', () => {
  const agent: AgentDraft = {
    name: 'reviewer',
    definition: {
      description: 'Reviews: diffs',
      prompt: 'You review code.\n',
      tools: ['Read', 'Grep'],
      disallowedTools: ['Write'],
      model: 'haiku',
      permissionMode: 'plan',
      maxTurns: 5,
      skills: ['review'],
      mcpServers: ['github'],
      memory: 'project',
      background: true,
      effort: 'low',
      initialPrompt: 'Start.',
    },
    extras: { color: 'cyan', isolation: 'worktree', cacheTtl: '1h' },
    hooks,
  };

  test('reads back to the same definition, extras and hooks', () => {
    const read = readAgent(renderAgentFile(agent), {
      path: 'agents/reviewer.md',
      source: 'project',
    });
    expect(read.issues).toEqual([]);
    expect(read.agent).toMatchObject({
      name: 'reviewer',
      definition: agent.definition,
      extras: agent.extras,
      hooks,
    });
  });

  test('keys follow the reference table; an unset field writes no key', () => {
    const text = renderAgentFile({ name: 'a', definition: { description: 'd', prompt: 'P' } });
    expect(text).toBe('---\nname: a\ndescription: d\n---\nP');
    expect(Object.keys(parseFrontmatter(renderAgentFile(agent)).fields)).toEqual([
      'name',
      'description',
      'tools',
      'disallowedTools',
      'model',
      'permissionMode',
      'maxTurns',
      'skills',
      'mcpServers',
      'hooks',
      'memory',
      'background',
      'effort',
      'isolation',
      'color',
      'initialPrompt',
      'experimental',
    ]);
  });
});
