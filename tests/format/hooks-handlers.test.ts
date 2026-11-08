/**
 * hooks.md § Hook handler fields (Common fields, Command hook fields, HTTP hook fields, MCP tool
 * hook fields, Prompt and agent hook fields) and § Exec form and shell form: every handler type and
 * the fields it accepts, read as the docs describe them. What a handler does when it runs (the
 * command spawned, the request sent, the timeout enforced) is the hooks module's, so only the
 * fields whose documented behaviour is what they accept (`type`, `shell`) are specs here.
 */
import { describe, expect, test } from 'bun:test';
import { readHooksFile } from '../../src/format/index.ts';
import { command, errorsOf, file, firstHandler, plain, warningsOf } from '../support/hooks-read.ts';
import { spec } from '../support/spec.ts';

/** Reads a hooks file with one group holding `handler`, under `event`. */
const read = (handler: unknown, event = 'PreToolUse') =>
  readHooksFile(file({ [event]: [{ hooks: [handler] }] }));

describe('Hook handler fields', () => {
  /** One valid handler per type, with every field the docs list for it. */
  const FULL = {
    command: {
      type: 'command',
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/scripts/format.js', '--fix'],
      async: false,
      asyncRewake: true,
      shell: 'powershell',
      onFailure: 'block',
      if: 'Bash(git *)',
      timeout: 30,
      statusMessage: 'Formatting',
      once: true,
    },
    http: {
      type: 'http',
      url: 'http://localhost:8080/hooks/pre-tool-use',
      timeout: 30,
      headers: { Authorization: 'Bearer $MY_TOKEN' },
      allowedEnvVars: ['MY_TOKEN'],
      onFailure: 'continue',
      if: 'Bash(git *)',
      statusMessage: 'Checking',
      once: false,
    },
    mcp_tool: {
      type: 'mcp_tool',
      server: 'my_server',
      tool: 'security_scan',
      input: { file_path: '${tool_input.file_path}' },
      if: 'Edit(*.ts)',
      timeout: 60,
      statusMessage: 'Scanning',
      once: true,
    },
    prompt: {
      type: 'prompt',
      prompt: 'Check $ARGUMENTS, costing \\$1.00',
      model: 'claude-sonnet-5',
      continueOnBlock: true,
      if: 'Bash(git *)',
      timeout: 30,
      statusMessage: 'Judging',
      once: false,
    },
    agent: {
      type: 'agent',
      prompt: 'Verify that unit tests ran and passed. $ARGUMENTS',
      model: 'claude-sonnet-5',
      if: 'Bash(git *)',
      timeout: 60,
      statusMessage: 'Verifying',
      once: false,
    },
  } as const;

  for (const [type, handler] of Object.entries(FULL)) {
    test(`a ${type} hook with every documented field reads unchanged`, () => {
      const result = read(handler);
      expect(result.issues).toEqual([]);
      expect(firstHandler(result)).toEqual(handler);
    });

    test(`a ${type} hook with only its required fields reads unchanged`, () => {
      const required = Object.fromEntries(
        Object.entries(handler).filter(([key]) =>
          ['type', 'command', 'url', 'server', 'tool', 'prompt'].includes(key),
        ),
      );
      const result = read(required);
      expect(result.issues).toEqual([]);
      expect(firstHandler(result)).toEqual(required);
    });
  }

  spec('hooks.handler.common.type', () => {
    test('is required and is one of command, http, mcp_tool, prompt and agent', () => {
      for (const type of ['command', 'http', 'mcp_tool', 'prompt', 'agent'] as const) {
        expect(read(FULL[type]).issues).toEqual([]);
      }
      const result = read({ command: 'x' });
      expect(plain(result.hooks)).toEqual({});
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', path: 'hooks.PreToolUse[0].hooks[0].type' }),
      );
    });

    test('any other type fails and names the five', () => {
      for (const type of ['script', 'Command', '', 3, null]) {
        const result = read({ type, command: 'x' });
        expect(plain(result.hooks)).toEqual({});
        const [issue] = errorsOf(result);
        expect(issue).toMatchObject({ path: 'hooks.PreToolUse[0].hooks[0].type' });
        expect(issue).toHaveProperty('message', expect.stringContaining('"mcp_tool"'));
      }
    });

    test('a handler that is not an object fails', () => {
      for (const handler of [null, 'echo hi', ['command']]) {
        expect(errorsOf(read(handler))).toHaveLength(1);
      }
    });
  });

  spec('hooks.handler.command.shell', () => {
    test('accepts "bash" or "powershell"', () => {
      for (const shell of ['bash', 'powershell']) {
        const result = read({ ...command, shell });
        expect(result.issues).toEqual([]);
        expect(firstHandler(result)).toMatchObject({ shell });
      }
    });

    test('any other shell fails', () => {
      for (const shell of ['zsh', 'sh', 'pwsh', 'Bash', true]) {
        const result = read({ ...command, shell });
        expect(plain(result.hooks)).toEqual({});
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            severity: 'error',
            path: 'hooks.PreToolUse[0].hooks[0].shell',
          }),
        );
      }
    });
  });

  // Required fields (the "Required: yes" column) and field types. The docs describe what each
  // field does when the hook runs; running is proven by the hooks module, so these are not specs.
  const REQUIRED: readonly [type: keyof typeof FULL, field: string][] = [
    ['command', 'command'],
    ['http', 'url'],
    ['mcp_tool', 'server'],
    ['mcp_tool', 'tool'],
    ['prompt', 'prompt'],
    ['agent', 'prompt'],
  ];
  for (const [type, field] of REQUIRED) {
    test(`a ${type} hook needs "${field}"`, () => {
      const { [field]: _omitted, ...without } = FULL[type] as Record<string, unknown>;
      const result = read(without);
      expect(plain(result.hooks)).toEqual({});
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          path: `hooks.PreToolUse[0].hooks[0].${field}`,
        }),
      );
    });
  }

  /** A value of the wrong type for each field, per handler type. */
  const WRONG: readonly [type: keyof typeof FULL, field: string, value: unknown][] = [
    ['command', 'command', 3],
    ['command', 'args', 'a b'],
    ['command', 'args', [1]],
    ['command', 'async', 'yes'],
    ['command', 'asyncRewake', 1],
    ['command', 'onFailure', 'ignore'],
    ['command', 'if', ['Bash(git *)']],
    ['command', 'timeout', '30'],
    ['command', 'timeout', 0],
    ['command', 'timeout', -5],
    ['command', 'statusMessage', 1],
    ['command', 'once', 'true'],
    ['http', 'url', 8080],
    ['http', 'headers', ['Authorization']],
    ['http', 'headers', { Authorization: 1 }],
    ['http', 'allowedEnvVars', 'MY_TOKEN'],
    ['http', 'onFailure', 'retry'],
    ['mcp_tool', 'server', 1],
    ['mcp_tool', 'tool', {}],
    ['mcp_tool', 'input', 'x'],
    ['prompt', 'prompt', ['text']],
    ['prompt', 'model', 5],
    ['prompt', 'continueOnBlock', 'yes'],
    ['agent', 'prompt', 5],
    ['agent', 'model', []],
  ];
  for (const [type, field, value] of WRONG) {
    test(`a ${type} hook: "${field}" of ${JSON.stringify(value)} fails`, () => {
      const result = read({ ...FULL[type], [field]: value });
      expect(plain(result.hooks)).toEqual({});
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          path: `hooks.PreToolUse[0].hooks[0].${field}`,
        }),
      );
    });
  }

  test('a field of another handler type is dropped with a warning', () => {
    const result = read({ type: 'prompt', prompt: 'p', command: 'x', async: true });
    expect(firstHandler(result)).toEqual({ type: 'prompt', prompt: 'p' });
    expect(warningsOf(result).map((found) => found.path)).toEqual([
      'hooks.PreToolUse[0].hooks[0].command',
      'hooks.PreToolUse[0].hooks[0].async',
    ]);
  });

  test('a field no handler has is dropped with a warning', () => {
    const result = read({ ...command, retries: 3 });
    expect(firstHandler(result)).toEqual(command);
    expect(warningsOf(result)).toEqual([
      expect.objectContaining({ path: 'hooks.PreToolUse[0].hooks[0].retries' }),
    ]);
  });

  test('"inputs" of an mcp_tool hook are kept as written, including ${path} references', () => {
    const result = read({
      type: 'mcp_tool',
      server: 's',
      tool: 't',
      input: { a: { b: ['${x}', 1] } },
    });
    expect(firstHandler(result)).toMatchObject({
      input: { a: { b: ['${x}', 1] } },
    });
  });

  describe('exec form (hooks.md, "Exec form and shell form")', () => {
    test('a bare command name that holds whitespace beside args warns: the spawn will fail', () => {
      const result = read({ type: 'command', command: 'node script.js', args: ['--fix'] });
      expect(errorsOf(result)).toEqual([]);
      expect(warningsOf(result)).toEqual([
        expect.objectContaining({ path: 'hooks.PreToolUse[0].hooks[0].command' }),
      ]);
    });

    test('no warning for a plain name, shell form, or an absolute path with spaces', () => {
      for (const handler of [
        { type: 'command', command: 'node', args: ['a b'] },
        { type: 'command', command: 'node script.js' },
        { type: 'command', command: 'C:\\Program Files\\nodejs\\node.exe', args: ['x'] },
        { type: 'command', command: '/opt/my tools/run', args: ['x'] },
      ]) {
        expect(read(handler).issues).toEqual([]);
      }
    });
  });

  test('the "if" of an event without tool calls is not a reading problem', () => {
    // hooks.md: on other events a hook with `if` set never runs; that is the engine's, not an error.
    expect(read({ ...command, if: 'Bash(git *)' }, 'Stop').issues).toEqual([]);
  });
});
