/**
 * sub-agents.md § Frontmatter reference (the `hooks` row: "Lifecycle hooks scoped to this subagent.
 * Ignored for plugin subagents"), § Define hooks for subagents > Hooks in subagent frontmatter ("All
 * hook events are supported"; the code-reviewer example) and § Choose the subagent scope (plugin
 * subagents "don't support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields").
 * Hooks in the db-reader example of § Example subagents. The parse side: what `readAgent` keeps of
 * the field. Which hooks fire, and when, is tests/agents/hooks.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { readAgent } from '../../src/format/agent.ts';
import { HOOK_EVENTS } from '../../src/protocol/hook-events.ts';
import { at, file, FILES, loaded, plugin } from '../support/agent-files.ts';
import { spec } from '../support/spec.ts';

// The sub-agents.md example, verbatim.
const CODE_REVIEWER = `name: code-reviewer
description: Review code changes with automatic linting
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-command.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"`;

// The "Database query validator" example, verbatim.
const DB_READER = `name: db-reader
description: Execute read-only database queries. Use when analyzing data or generating reports.
tools: Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"`;

const read = (front: string, origin = at('project')) => readAgent(file(front), origin);

spec('agents.frontmatter.hooks', () => {
  test.each(FILES)('a %s agent keeps the code-reviewer hooks in the settings shape', (source) => {
    const result = read(CODE_REVIEWER, at(source));
    expect(result.issues).toEqual([]);
    expect(loaded(result).hooks).toEqual({
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/validate-command.sh' }] },
      ],
      PostToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: './scripts/run-linter.sh' }] },
      ],
    });
  });

  test('the db-reader example keeps its single PreToolUse hook next to the tools field', () => {
    const agent = loaded(read(DB_READER, at('user')));
    expect(agent.hooks).toEqual({
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: './scripts/validate-readonly-query.sh' }],
        },
      ],
    });
    expect(agent.definition.tools).toEqual(['Bash']);
  });

  test('the hooks are not part of the official definition: the record carries them apart', () => {
    const agent = loaded(read(CODE_REVIEWER));
    expect(agent.definition).not.toHaveProperty('hooks');
  });

  test.each(HOOK_EVENTS)(
    '"All hook events are supported": %s is accepted without an issue',
    (event) => {
      const result = read(
        `name: any\ndescription: Any event\nhooks:\n  ${event}:\n    - hooks:\n        - type: command\n          command: ./hook.sh`,
      );
      expect(result.issues).toEqual([]);
      expect(Object.keys(loaded(result).hooks ?? {})).toEqual([event]);
    },
  );

  test('a plugin agent ignores the field: named in ignored, no hooks, nothing validated', () => {
    for (const relativePath of [undefined, 'review/security.md']) {
      const result = readAgent(file(CODE_REVIEWER), plugin(relativePath));
      const agent = loaded(result);
      expect(agent.ignored).toEqual(['hooks']);
      expect(agent.hooks).toBeUndefined();
      expect(result.issues).toEqual([]);
    }
  });

  test('a plugin agent without the field ignores nothing', () => {
    const agent = loaded(readAgent(file('name: helper\ndescription: Helps'), plugin()));
    expect(agent.ignored).toEqual([]);
    expect(agent.hooks).toBeUndefined();
  });

  test('a file agent without the field has no hooks and no issue', () => {
    const result = read('name: helper\ndescription: Helps');
    expect(loaded(result).hooks).toBeUndefined();
    expect(result.issues).toEqual([]);
  });

  test('hooks that do not fit the hook format are reported and keep no hook; the agent still loads', () => {
    const result = read('name: helper\ndescription: Helps\nhooks:\n  PreToolUse: not a list');
    expect(result.outcome).toBe('loaded');
    expect(loaded(result).hooks).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe('warning');
    expect(result.issues[0]?.message).toContain('Invalid "hooks"');
  });
});

describe('the hooks field outside the docs (judgments)', () => {
  test('an event name Claude Code does not know drops all the hooks of the file', () => {
    const result = read(
      'name: helper\ndescription: Helps\nhooks:\n  PreToolUse:\n    - hooks:\n        - type: command\n          command: ./a.sh\n  Nope: []',
    );
    expect(loaded(result).hooks).toBeUndefined();
    expect(result.issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  test('an empty map is kept as no hook', () => {
    expect(loaded(read('name: helper\ndescription: Helps\nhooks: {}')).hooks).toEqual({});
  });
});
