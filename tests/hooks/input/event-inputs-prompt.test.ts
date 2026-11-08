/**
 * hooks.md, the "<Event> input" section of UserPromptExpansion, UserPromptSubmit, WorktreeCreate
 * and WorktreeRemove: the documented JSON example is what the kit builds, optional fields are absent
 * when not given, and a wrong type or a value outside the documented set is refused with an error
 * naming the field.
 */
import { describe, expect, test } from 'bun:test';
import { builtFromExample, builtInput } from '../../support/hooks-doc-input.ts';
import { spec } from '../../support/spec.ts';

const TRANSCRIPT = '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl';
const head = { session_id: 'abc123', transcript_path: TRANSCRIPT, cwd: '/Users/me' };

spec('hooks.behavior.UserPromptExpansion input', () => {
  const example = {
    session_id: 'abc123',
    transcript_path: '/Users/me/.claude/projects/p/00893aaf.jsonl',
    cwd: '/Users/me',
    permission_mode: 'default',
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'example-skill',
    command_args: 'arg1 arg2',
    command_source: 'plugin',
    prompt: '/example-skill arg1 arg2',
  };

  test('the documented example', () => {
    expect(builtFromExample('UserPromptExpansion', example).wire).toEqual(example);
  });

  test('an MCP server prompt has expansion_type mcp_prompt', () => {
    const { wire } = builtInput('UserPromptExpansion', {
      expansion_type: 'mcp_prompt',
      command_name: 'mcp__srv__review',
      command_args: '',
      prompt: '/mcp__srv__review',
    });
    expect(wire?.['expansion_type']).toBe('mcp_prompt');
  });

  test('an expansion type other than slash_command and mcp_prompt is refused', () => {
    const refused = builtInput('UserPromptExpansion', {
      expansion_type: 'skill',
      command_name: 'x',
      command_args: '',
      prompt: '/x',
    });
    expect(refused.errors).toEqual(['hooks.UserPromptExpansion.input.expansion_type']);
  });

  test.each(['command_name', 'command_args', 'prompt'])('without %s there is no input', (field) => {
    const facts: Record<string, unknown> = {
      expansion_type: 'slash_command',
      command_name: 'x',
      command_args: '',
      prompt: '/x',
    };
    delete facts[field];
    expect(builtInput('UserPromptExpansion', facts).errors).toEqual([
      `hooks.UserPromptExpansion.input.${field}`,
    ]);
  });
});

spec('hooks.behavior.UserPromptSubmit input', () => {
  const example = {
    session_id: 'abc123',
    transcript_path: '/Users/me/.claude/projects/p/00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl',
    cwd: '/Users/me',
    permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Write a function to calculate the factorial of a number',
  };

  test('the documented example', () => {
    expect(builtFromExample('UserPromptSubmit', example).wire).toEqual(example);
  });

  test('a skill typed as /deploy staging arrives as the line typed, not the expanded content', () => {
    expect(builtInput('UserPromptSubmit', { prompt: '/deploy staging' }).wire?.['prompt']).toBe(
      '/deploy staging',
    );
  });

  test('a prompt with pasted text keeps the lines around it', () => {
    const prompt = 'see\n<pasted_content id="1">\nlog line\n</pasted_content id="1">';
    expect(builtInput('UserPromptSubmit', { prompt }).wire?.['prompt']).toBe(prompt);
  });

  test('session_title arrives when the session has a custom title, and is absent otherwise', () => {
    expect(
      builtInput('UserPromptSubmit', { prompt: 'p', session_title: 'Fix login' }).wire?.[
        'session_title'
      ],
    ).toBe('Fix login');
    expect(builtFromExample('UserPromptSubmit', example).wire).not.toHaveProperty('session_title');
  });

  test('the prompt is required and a string', () => {
    expect(builtInput('UserPromptSubmit', {}).errors).toEqual([
      'hooks.UserPromptSubmit.input.prompt',
    ]);
    expect(builtInput('UserPromptSubmit', { prompt: 1 }).errors).toEqual([
      'hooks.UserPromptSubmit.input.prompt',
    ]);
  });
});

describe.each([
  ['WorktreeCreate', 'name', 'feature-auth', 'hooks.behavior.WorktreeCreate input'],
  [
    'WorktreeRemove',
    'worktree_path',
    '/Users/me/my-project/.claude/worktrees/feature-auth',
    'hooks.behavior.WorktreeRemove input',
  ],
] as const)('%s', (event, field, value, id) => {
  spec(id, () => {
    const example = { ...head, hook_event_name: event, [field]: value };

    test(`the documented example: ${field} follows the common fields`, () => {
      expect(builtFromExample(event, example).wire).toEqual(example);
    });

    test(`${field} is required and a string`, () => {
      expect(builtInput(event, {}).errors).toEqual([`hooks.${event}.input.${field}`]);
      expect(builtInput(event, { [field]: 7 }).errors).toEqual([`hooks.${event}.input.${field}`]);
    });

    test('the section has no permission_mode: a session in a mode does not add one', () => {
      expect(
        builtInput(event, { [field]: value }, { permissionMode: 'auto' }).wire,
      ).not.toHaveProperty('permission_mode');
    });
  });
});
