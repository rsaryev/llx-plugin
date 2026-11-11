/**
 * sub-agents.md, "Frontmatter reference" (`name` and `description` are required) and "Subagent
 * files Claude Code skips"; plugins/components.md, "Agents", "Organize agents in subfolders" and
 * "Frontmatter fields in plugin agents".
 */
import { describe, expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import { spec } from '../support/spec.ts';

import { at, file, FILES, loaded, plugin } from '../support/agent-files.ts';

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
      ['starts with "-"', '-reviewer', 'starts with "-"'],
      ['contains ":"', 'my-plugin:reviewer', 'contains ":"'],
      ['is longer than 256 characters', 'a'.repeat(257), 'longer than 256 characters'],
    ])('a name that %s: skipped with an error naming that rule', (_why, name, rule) => {
      const result = readAgent(file(`name: ${name}\ndescription: d`), at(source));
      expect(result).toMatchObject({ outcome: 'skipped', reason: 'invalid', agent: undefined });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({ severity: 'error', path: 'agents/reviewer.md' });
      expect(result.issues[0]?.message).toContain('Invalid "name"');
      expect(result.issues[0]?.message).toContain(rule);
    });

    test('a name of exactly 256 characters loads', () => {
      const name = 'a'.repeat(256);
      const result = readAgent(file(`name: ${name}\ndescription: d`), at(source));
      expect(loaded(result).name).toBe(name);
      expect(result.issues).toEqual([]);
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
      const result = readAgent(file('name: reviewer\ndescription: "unclosed'), at(source));
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

    test('a name of exactly 256 characters is kept', () => {
      const name = 'n'.repeat(256);
      const result = readAgent(
        file(`name: ${name}\ndescription: Reviews`),
        plugin('security.md', 'agents/security.md'),
      );
      expect(loaded(result).name).toBe(name);
      expect(result.issues).toEqual([]);
    });

    test('an opening --- that is not the first line: no frontmatter, so the file name and the fallback description', () => {
      const text = `\n${file('name: x\ndescription: d', 'body')}`;
      const result = readAgent(text, plugin('security.md', 'agents/security.md'));
      const agent = loaded(result);
      expect(agent.name).toBe('security');
      expect(agent.scopedName).toBe('my-plugin:security');
      expect(agent.definition.description).toBe('Agent from my-plugin plugin');
    });

    test('frontmatter that does not parse: the agent still loads, named after the file', () => {
      const result = readAgent(
        file('name: reviewer\ndescription: "unclosed\nmodel: sonnet', 'Prompt body.\n'),
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
