/**
 * What the host process is to the hook it starts: env-vars.md `CLAUDE_CODE_SESSION_ID` ("matches the
 * `session_id` field in the hook JSON input and is updated on `/clear`"), `CLAUDECODE` ("Set to `1`
 * in subprocesses Claude Code spawns ... hook commands"), `CLAUDE_PID` ("its own process ID in the
 * subprocesses it spawns"), § Precedence (the settings files' `env` replaces the shell's value);
 * plugins/components.md § Environment, quoting, and matching MCP tools ("every hook process receives
 * `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` in its environment, plus `CLAUDE_PLUGIN_OPTION_<KEY>`
 * for each user configuration value", the quoting of `${CLAUDE_PLUGIN_ROOT}` with and without `args`,
 * the name of a plugin's own MCP tools in a matcher).
 */
import { describe, expect, test } from 'bun:test';
import { createHookEngine, createHookRegistry, runHandler } from '../../../../src/hooks/index.ts';
import { mcpToolName, pluginMcpServerName } from '../../../../src/rules/index.ts';
import { cmd } from '../../../support/hooks-fire.ts';
import { FACTS, entry, select, session } from '../../../support/hooks-select.ts';
import { fakeOutput } from '../../../support/hooks-verdict.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';

/** Dispatches `event` for each session in turn through one engine; returns what the runner was asked. */
async function dispatched(
  sessions: readonly string[],
  options: { processId?: number; environment?: Record<string, string> } = {},
  handler = cmd(),
) {
  const runner = scriptedRunner(...sessions.map(() => ({})));
  const engine = createHookEngine(
    { commands: runner, locations: locations(), environment: fakeEnvironment(options.environment) },
    {
      output: fakeOutput,
      ...(options.processId === undefined ? {} : { processId: options.processId }),
    },
  );
  const registry = createHookRegistry([entry('Stop', { handler })]);
  for (const sessionId of sessions) {
    await engine.dispatch(registry, {
      event: 'Stop',
      facts: FACTS.Stop,
      session: session({ sessionId }),
      signal: new AbortController().signal,
    });
  }
  return runner.calls;
}

spec('environment.host.CLAUDE_CODE_SESSION_ID', () => {
  test('a hook command gets the session id, the same as the session_id of its JSON input', async () => {
    const [call] = await dispatched(['sess-42']);
    expect(call?.env['CLAUDE_CODE_SESSION_ID']).toBe('sess-42');
    expect(JSON.parse(call?.stdin ?? '{}').session_id).toBe(call?.env['CLAUDE_CODE_SESSION_ID']);
  });

  test('it follows a /clear: the next hook of the same host gets the new session id', async () => {
    const calls = await dispatched(['before-clear', 'after-clear']);
    expect(calls.map((call) => call.env['CLAUDE_CODE_SESSION_ID'])).toEqual([
      'before-clear',
      'after-clear',
    ]);
    expect(calls.map((call) => JSON.parse(call.stdin ?? '{}').session_id)).toEqual([
      'before-clear',
      'after-clear',
    ]);
  });

  test('exec form and shell form get it alike', async () => {
    for (const handler of [cmd(), { type: 'command' as const, command: 'tool', args: [] }]) {
      const [call] = await dispatched(['s9'], {}, handler);
      expect(call?.env['CLAUDE_CODE_SESSION_ID']).toBe('s9');
    }
  });

  test('it replaces a session id inherited from an outer Claude Code', async () => {
    const [call] = await dispatched(['inner'], {
      environment: { CLAUDE_CODE_SESSION_ID: 'outer' },
    });
    expect(call?.env['CLAUDE_CODE_SESSION_ID']).toBe('inner');
  });
});

describe('judgment: no session id', () => {
  test('a run with no session sets no CLAUDE_CODE_SESSION_ID, and keeps none it inherited as its own', async () => {
    const runner = scriptedRunner({});
    await runHandler(settingsCommand({ command: './h.sh' }), runContext({ runner }));
    expect(runner.calls[0]?.env).not.toHaveProperty('CLAUDE_CODE_SESSION_ID');
  });
});

spec('environment.host.CLAUDECODE', () => {
  test('is 1 in a hook command, in shell form and in exec form', async () => {
    for (const hook of [{ command: './h.sh' }, { command: 'tool', args: [] as string[] }]) {
      const runner = scriptedRunner({});
      await runHandler(settingsCommand(hook), runContext({ runner }));
      expect(runner.calls[0]?.env['CLAUDECODE']).toBe('1');
    }
  });

  test('a value inherited from the environment does not stay: the hook sees 1', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({ runner, environment: fakeEnvironment({ CLAUDECODE: '0' }) }),
    );
    expect(runner.calls[0]?.env['CLAUDECODE']).toBe('1');
  });
});

describe('env-vars.md § CLAUDE_CODE_CHILD_SESSION (no requirement id of its own)', () => {
  test('is 1 in hook commands', async () => {
    const runner = scriptedRunner({});
    await runHandler(settingsCommand({ command: './h.sh' }), runContext({ runner }));
    expect(runner.calls[0]?.env['CLAUDE_CODE_CHILD_SESSION']).toBe('1');
  });
});

spec('environment.host.CLAUDE_PID', () => {
  test('is the id of the host process, as text, in a hook command', async () => {
    const [call] = await dispatched(['s1'], { processId: 4242 });
    expect(call?.env['CLAUDE_PID']).toBe('4242');
  });

  test('replaces a CLAUDE_PID inherited from an outer Claude Code', async () => {
    const [call] = await dispatched(['s1'], {
      processId: 77,
      environment: { CLAUDE_PID: '1' },
    });
    expect(call?.env['CLAUDE_PID']).toBe('77');
  });

  test('a host that gives no process id has none to export: the variable is not invented', async () => {
    const [call] = await dispatched(['s1']);
    expect(call?.env).not.toHaveProperty('CLAUDE_PID');
  });
});

describe('env-vars.md § Precedence, in a hook process', () => {
  test('the settings files env replaces the value the shell exported', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({
        runner,
        environment: fakeEnvironment({ API_TIMEOUT_MS: '1000', LANG: 'C' }),
        settingsEnv: { API_TIMEOUT_MS: '1200000', EXTRA: '1' },
      }),
    );
    expect(runner.calls[0]?.env).toMatchObject({
      API_TIMEOUT_MS: '1200000',
      LANG: 'C',
      EXTRA: '1',
    });
  });

  test('what Claude Code exports to a hook wins over the settings env', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({ runner, settingsEnv: { CLAUDE_PROJECT_DIR: '/evil', CLAUDECODE: '0' } }),
    );
    expect(runner.calls[0]?.env).toMatchObject({
      CLAUDE_PROJECT_DIR: '/work/app',
      CLAUDECODE: '1',
    });
  });

  test('the OTEL_* removal applies to a variable the settings set too', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      settingsCommand({ command: './h.sh' }),
      runContext({ runner, settingsEnv: { OTEL_METRICS_EXPORTER: 'otlp' } }),
    );
    expect(runner.calls[0]?.env).not.toHaveProperty('OTEL_METRICS_EXPORTER');
  });
});

const OPTIONS = {
  declared: {
    api_url: { type: 'string' as const, title: 'API', description: 'Where' },
    region: { type: 'string' as const, title: 'Region', description: 'Which' },
  },
  values: { api_url: 'https://api.example.com', region: 'eu' },
};

spec('hooks.components.Environment, quoting, and matching MCP tools.Environment', () => {
  for (const [form, hook] of [
    ['shell', { command: '"${CLAUDE_PLUGIN_ROOT}"/run.sh' }],
    ['exec', { command: 'run.sh', args: [] as string[] }],
  ] as const) {
    test(`every ${form}-form hook process receives CLAUDE_PLUGIN_ROOT, CLAUDE_PLUGIN_DATA and one CLAUDE_PLUGIN_OPTION_<KEY> per user configuration value`, async () => {
      const runner = scriptedRunner({});
      await runHandler(pluginCommand(hook), runContext({ runner, userConfigOf: () => OPTIONS }));
      expect(runner.calls[0]?.env).toMatchObject({
        CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
        CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
        CLAUDE_PLUGIN_OPTION_API_URL: 'https://api.example.com',
        CLAUDE_PLUGIN_OPTION_REGION: 'eu',
      });
    });
  }

  test('a hook of the plugin gets them on any event, a hook of no plugin gets none', async () => {
    const runner = scriptedRunner({}, {});
    await runHandler(pluginCommand({ command: './h.sh' }, 'SessionStart'), runContext({ runner }));
    await runHandler(
      settingsCommand({ command: './h.sh' }, 'SessionStart'),
      runContext({ runner }),
    );
    expect(runner.calls[0]?.env).toHaveProperty('CLAUDE_PLUGIN_ROOT');
    expect(runner.calls[1]?.env).not.toHaveProperty('CLAUDE_PLUGIN_ROOT');
  });
});

spec('hooks.components.Environment, quoting, and matching MCP tools.Quoting', () => {
  const spaced = locations({ plugins: '/Users/ann smith/.claude/plugins' });

  test('with no args the command runs through a shell: the quoted path stays one shell word', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      pluginCommand({ command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh' }),
      runContext({ runner, locations: spaced }),
    );
    expect(runner.calls[0]?.spec).toEqual({
      form: 'shell',
      shell: 'bash',
      command: '"/Users/ann smith/.claude/plugins/formatter@acme-tools"/scripts/process.sh',
    });
  });

  test('with args each element is one argument with no shell, and needs no quoting', async () => {
    const runner = scriptedRunner({});
    await runHandler(
      pluginCommand({
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/scripts/process.js', '--fix'],
      }),
      runContext({ runner, locations: spaced }),
    );
    expect(runner.calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/Users/ann smith/.claude/plugins/formatter@acme-tools/scripts/process.js', '--fix'],
    });
  });
});

spec(
  // A template literal: the id holds an apostrophe, which the static scan of `check:spec` cannot read
  // in a quoted string; `spec` checks it against the requirements when the test runs.
  `hooks.components.Environment, quoting, and matching MCP tools.Matching the plugin's own MCP tools`,
  () => {
    const plugin = 'my-plugin';
    const server = 'db';
    const tool = 'query';
    const named = mcpToolName(pluginMcpServerName(plugin, server), tool);
    const fires = (matcher: string): boolean =>
      select([entry('PreToolUse', { matcher })], 'PreToolUse', {
        ...FACTS.PreToolUse,
        tool_name: named,
      }).selected.length === 1;

    test('the tool is named mcp__plugin_<plugin>_<server>__<tool>', () => {
      expect(named).toBe('mcp__plugin_my-plugin_db__query');
    });

    test('the full name in a matcher fires, and so does the server prefix with .*', () => {
      expect(fires('mcp__plugin_my-plugin_db__query')).toBe(true);
      expect(fires('mcp__plugin_my-plugin_db__.*')).toBe(true);
    });

    test('a matcher on the server name alone never fires', () => {
      expect(fires('db')).toBe(false);
      expect(fires('mcp__db__query')).toBe(false);
      expect(fires('mcp__db__.*')).toBe(false);
      expect(fires('mcp__plugin_my-plugin_db')).toBe(false);
    });
  },
);
