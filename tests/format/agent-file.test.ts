/**
 * sub-agents.md, "Frontmatter reference" (`name` and `description` are required) and "Subagent
 * files Claude Code skips"; plugins/components.md, "Agents", "Organize agents in subfolders" and
 * "Frontmatter fields in plugin agents".
 */
import { describe, expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import type { AgentOrigin } from '../../src/format/agent-record.ts';
import { spec } from '../support/spec.ts';

const file = (front: string, body = 'You are a reviewer.\n'): string =>
  `---\n${front}\n---\n${body}`;
const FILES = ['project', 'user', 'managed'] as const;
const at = (source: (typeof FILES)[number], path = 'agents/reviewer.md'): AgentOrigin => ({
  source,
  path,
});
const plugin = (relativePath?: string, path = 'agents/reviewer.md'): AgentOrigin => ({
  source: 'plugin',
  path,
  plugin: { name: 'my-plugin', relativePath },
});

const loaded = (result: ReturnType<typeof readAgent>) => {
  if (result.outcome !== 'loaded') throw new Error(`expected loaded, got ${result.reason}`);
  return result.agent;
};

spec(['agents.frontmatter.name', 'agents.frontmatter.description'], () => {
  test('a file with a name and a description loads; the body is the prompt', () => {
    const result = readAgent(
      file('name: code-reviewer\ndescription: Reviews code after every change', 'Be strict.\n'),
      at('project'),
    );
    const agent = loaded(result);
    expect(agent.name).toBe('code-reviewer');
    expect(agent.scopedName).toBe('code-reviewer');
    expect(agent.source).toBe('project');
    expect(agent.path).toBe('agents/reviewer.md');
    expect(agent.definition).toEqual({
      description: 'Reviews code after every change',
      prompt: 'Be strict.\n',
    });
    expect(result.issues).toEqual([]);
  });

  test('the filename does not have to match the name', () => {
    const agent = loaded(
      readAgent(file('name: reviewer-v2\ndescription: d'), at('user', '~/.claude/agents/old.md')),
    );
    expect(agent.name).toBe('reviewer-v2');
  });

  test('a description may span several lines (YAML block scalar)', () => {
    const agent = loaded(
      readAgent(file('name: a\ndescription: |\n  Use for audits.\n  Use proactively.'), at('user')),
    );
    expect(agent.definition.description).toBe('Use for audits.\nUse proactively.');
  });
});

describe.each(FILES)('files Claude Code skips: %s agents directory', (source) => {
  spec('agents.frontmatter.name', () => {
    test('no name: the file is documentation kept beside the agents, and nothing is reported', () => {
      const result = readAgent(file('description: Notes about the agents'), at(source));
      expect(result).toEqual({
        outcome: 'skipped',
        reason: 'documentation',
        agent: undefined,
        issues: [],
      });
    });

    test('no frontmatter at all is documentation too', () => {
      const result = readAgent('# How we write agents\n\nSome text.\n', at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'documentation' });
    });

    test('an opening --- that is not the first line: no frontmatter, so documentation', () => {
      const text = `\n${file('name: reviewer\ndescription: d')}`;
      const result = readAgent(text, at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'documentation', issues: [] });
    });

    test.each([
      ['starts with "-"', '-reviewer'],
      ['contains ":"', 'my-plugin:reviewer'],
      ['is longer than 256 characters', 'a'.repeat(257)],
    ])('a name that %s: skipped with an error', (_why, name) => {
      const result = readAgent(file(`name: ${name}\ndescription: d`), at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid', agent: undefined });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'agents/reviewer.md' });
      expect(result.issues[0]?.message).toContain('name');
    });
  });

  spec('agents.frontmatter.description', () => {
    test('a name but no description: skipped, and the reason is reported', () => {
      const result = readAgent(file('name: reviewer'), at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid', agent: undefined });
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'agents/reviewer.md' });
      expect(result.issues[0]?.message).toContain('description');
    });

    test('a blank description is no description', () => {
      const result = readAgent(file('name: reviewer\ndescription: ""'), at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid' });
    });
  });

  spec(['agents.frontmatter.name', 'agents.frontmatter.description'], () => {
    test('YAML that does not parse: no fields are read, the file is skipped, the error is kept', () => {
      const result = readAgent(file('name: reviewer\ndescription: [unclosed'), at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid', agent: undefined });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'agents/reviewer.md' });
      expect(result.issues[0]?.message).toContain('does not parse');
    });
  });
});

spec(['agents.frontmatter.name', 'agents.frontmatter.description'], () => {
  describe('plugin agents (plugins/components.md)', () => {
    test('named <plugin>:<name>, the name from the frontmatter', () => {
      const result = readAgent(
        file(
          'name: security-reviewer\ndescription: Reviews code changes for security issues.\nmodel: sonnet',
        ),
        plugin(undefined, 'agents/security-reviewer.md'),
      );
      const agent = loaded(result);
      expect(agent.name).toBe('security-reviewer');
      expect(agent.scopedName).toBe('my-plugin:security-reviewer');
      expect(agent.source).toBe('plugin');
      expect(result.issues).toEqual([]);
    });

    test('a missing name falls back to the file name, with no issue', () => {
      const result = readAgent(
        file('description: Reviews'),
        plugin('security.md', 'agents/security.md'),
      );
      const agent = loaded(result);
      expect(agent.name).toBe('security');
      expect(agent.scopedName).toBe('my-plugin:security');
      expect(result.issues).toEqual([]);
    });

    test('a file with no frontmatter loads under its file name', () => {
      const result = readAgent('Just a prompt.\n', plugin('helper.md', 'agents/helper.md'));
      const agent = loaded(result);
      expect(agent.scopedName).toBe('my-plugin:helper');
      expect(agent.definition.prompt).toBe('Just a prompt.\n');
    });

    test('a name longer than 256 characters is ignored: the agent takes its file name', () => {
      const result = readAgent(
        file(`name: ${'n'.repeat(257)}\ndescription: Reviews`),
        plugin('security.md', 'agents/security.md'),
      );
      const agent = loaded(result);
      expect(agent.name).toBe('security');
      expect(agent.scopedName).toBe('my-plugin:security');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'warning', path: 'agents/security.md' });
      expect(result.issues[0]?.message).toContain('256');
    });

    test('frontmatter that does not parse: the agent still loads, named after the file', () => {
      const result = readAgent(
        file('name: reviewer\ndescription: [unclosed\nmodel: sonnet', 'Prompt body.\n'),
        plugin('review/security.md', 'agents/review/security.md'),
      );
      const agent = loaded(result);
      expect(agent.name).toBe('security');
      expect(agent.scopedName).toBe('my-plugin:review:security');
      expect(agent.definition).toEqual({
        description: 'Agent from my-plugin plugin',
        prompt: 'Prompt body.\n',
      });
      expect(result.issues[0]).toMatchObject({
        severity: 'warning',
        path: 'agents/review/security.md',
      });
      expect(result.issues[0]?.message).toContain('does not parse');
    });

    test('a subfolder of agents/ is part of the scoped name', () => {
      const agent = loaded(
        readAgent(
          file('name: security\ndescription: d'),
          plugin('review/security.md', 'agents/review/security.md'),
        ),
      );
      expect(agent.name).toBe('security');
      expect(agent.scopedName).toBe('my-plugin:review:security');
    });

    test('the frontmatter name replaces only the file name: audit in review/security.md', () => {
      const agent = loaded(
        readAgent(
          file('name: audit\ndescription: d'),
          plugin('review/security.md', 'agents/review/security.md'),
        ),
      );
      expect(agent.scopedName).toBe('my-plugin:review:audit');
    });

    test('a file listed in the manifest loads without subfolder names', () => {
      const agent = loaded(
        readAgent(file('description: d'), plugin(undefined, './custom/review/security.md')),
      );
      expect(agent.scopedName).toBe('my-plugin:security');
    });
  });
});

describe('judgments the docs leave open (spec/judgments.md)', () => {
  test('a plugin agent with a name but no description loads with the fallback description and a warning', () => {
    const result = readAgent(file('name: helper'), plugin(undefined, 'agents/helper.md'));
    expect(loaded(result).definition.description).toBe('Agent from my-plugin plugin');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
    expect(result.issues[0]?.message).toContain('description');
  });

  test('a plugin name with ":" or a leading "-" is kept as written: the docs give only the length fallback', () => {
    const colon = readAgent(file('name: a:b\ndescription: d'), plugin(undefined, 'agents/x.md'));
    expect(loaded(colon).scopedName).toBe('my-plugin:a:b');
    const dash = readAgent(file('name: -a\ndescription: d'), plugin(undefined, 'agents/x.md'));
    expect(loaded(dash).name).toBe('-a');
  });

  test('a plugin name that is not text falls back to the file name with a warning', () => {
    const result = readAgent(
      file('name: [a, b]\ndescription: d'),
      plugin(undefined, 'agents/x.md'),
    );
    expect(loaded(result).name).toBe('x');
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
  });

  test('a name that is not text in a project file is invalid, not documentation', () => {
    const result = readAgent(file('name: [a, b]\ndescription: d'), at('project'));
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid' });
  });

  test('a number is read as its text, like every frontmatter text field', () => {
    const agent = loaded(readAgent(file('name: 2024\ndescription: d'), at('project')));
    expect(agent.name).toBe('2024');
  });

  test('frontmatter that is a list, not a table, is handled like YAML that does not parse', () => {
    expect(readAgent('---\n- a\n- b\n---\nbody', at('project'))).toMatchObject({
      outcome: 'skipped',
      reason: 'invalid',
    });
    const inPlugin = readAgent('---\n- a\n---\nbody', plugin(undefined, 'agents/x.md'));
    expect(loaded(inPlugin).definition.description).toBe('Agent from my-plugin plugin');
  });

  test('a parse issue names the line of the YAML problem', () => {
    const result = readAgent('---\nname: a\nb: c: d\n---\n', at('user'));
    expect(result.issues[0]?.message).toContain('line 3');
  });

  test('the prompt is the body exactly as written, and the other record fields start empty', () => {
    const agent = loaded(readAgent(file('name: a\ndescription: d', '\n\nBody\n\n'), at('user')));
    expect(agent.definition.prompt).toBe('\n\nBody\n\n');
    expect(agent).toMatchObject({ extras: {}, hooks: undefined, ignored: [], unrecognized: [] });
  });
});
