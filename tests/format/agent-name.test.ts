/**
 * sub-agents.md, "Frontmatter reference" (the `name` row and "Subagent files Claude Code skips");
 * plugins/components.md, "Agents" and "Organize agents in subfolders"; hooks.md, "SubagentStart"
 * (the agent type a hook receives).
 */
import { describe, expect, test } from 'bun:test';
import {
  agentFileName,
  agentNameProblem,
  hookAgentType,
  scopedAgentName,
  validAgentName,
} from '../../src/format/agent-name.ts';
import { spec } from '../support/spec.ts';

spec('agents.frontmatter.name', () => {
  test('the names the docs give as examples are valid', () => {
    expect(validAgentName('code-reviewer')).toBe(true);
    expect(validAgentName('reviewer-v2')).toBe(true);
  });

  test('a name is at most 256 characters', () => {
    expect(validAgentName('a'.repeat(256))).toBe(true);
    expect(validAgentName('a'.repeat(257))).toBe(false);
    expect(agentNameProblem('a'.repeat(257))).toContain('256');
  });

  test('a name cannot contain ":", which is reserved for plugin-scoped identifiers', () => {
    expect(validAgentName('my-plugin:reviewer')).toBe(false);
    expect(agentNameProblem('my-plugin:reviewer')).toContain('":"');
  });

  test('a name cannot start with "-"', () => {
    expect(validAgentName('-reviewer')).toBe(false);
    expect(validAgentName('re-viewer')).toBe(true);
    expect(agentNameProblem('-reviewer')).toContain('"-"');
  });

  test('a plugin agent is named <plugin>:<name>', () => {
    expect(scopedAgentName('my-plugin', undefined, 'security-reviewer')).toBe(
      'my-plugin:security-reviewer',
    );
  });

  test('a subfolder of agents/ becomes part of the scoped name, joined by colons', () => {
    expect(scopedAgentName('my-plugin', 'review/security.md', 'security')).toBe(
      'my-plugin:review:security',
    );
    expect(scopedAgentName('p', 'a/b/c.md', 'c')).toBe('p:a:b:c');
  });

  test('the frontmatter name replaces only the file name segment', () => {
    expect(scopedAgentName('my-plugin', 'review/security.md', 'audit')).toBe(
      'my-plugin:review:audit',
    );
  });

  test('a file listed in the manifest loads without subfolder names', () => {
    // "agents": "./custom/review/security.md" loads as my-plugin:security
    expect(
      scopedAgentName('my-plugin', undefined, agentFileName('./custom/review/security.md')),
    ).toBe('my-plugin:security');
  });

  test('hooks receive the frontmatter name, or the plugin-scoped identifier for a plugin agent', () => {
    const own = { name: 'security-reviewer', scopedName: 'security-reviewer' } as const;
    expect(hookAgentType({ ...own, source: 'project' })).toBe('security-reviewer');
    expect(hookAgentType({ ...own, source: 'user' })).toBe('security-reviewer');
    expect(hookAgentType({ ...own, source: 'managed' })).toBe('security-reviewer');
    expect(hookAgentType({ ...own, source: 'flag' })).toBe('security-reviewer');
    expect(
      hookAgentType({
        name: 'reviewer',
        scopedName: 'my-plugin:reviewer',
        source: 'plugin',
      }),
    ).toBe('my-plugin:reviewer');
  });
});

describe('agent file names (judgment: the extension and separators)', () => {
  test('the file name is the last path segment without .md, any case, either separator', () => {
    expect(agentFileName('agents/review/security.md')).toBe('security');
    expect(agentFileName('C:\\plugin\\agents\\Security.MD')).toBe('Security');
    expect(agentFileName('security')).toBe('security');
    expect(agentFileName('notes.v2.md')).toBe('notes.v2');
  });

  test('empty and "." segments of a relative path add no name part', () => {
    expect(scopedAgentName('p', './review//x.md', 'x')).toBe('p:review:x');
    expect(scopedAgentName('p', 'review\\x.md', 'x')).toBe('p:review:x');
  });

  test('the length is counted in UTF-16 code units, as the host language counts a string', () => {
    expect(validAgentName('\u{1F600}'.repeat(128))).toBe(true);
    expect(validAgentName('\u{1F600}'.repeat(129))).toBe(false);
  });
});
