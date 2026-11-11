/**
 * hooks.md § Hook handler fields, "Command hook fields" (`command`, `args`) and "Exec form and
 * shell form": `args` present means exec form, `command` is the executable and each `args` element
 * one argument "exactly as written", with "no shell"; path placeholders and, for plugin hooks,
 * `${user_config.*}` are substituted "as plain strings"; a bare name with whitespace beside `args`
 * logs a warning, an absolute path with spaces does not; "both export [the placeholders] as the
 * environment variables" `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA`.
 * hooks.md § Reference scripts by path: `${CLAUDE_PROJECT_DIR}` in a settings hook. The hook's own
 * `command` field: the string a shell runs, or with `args` the executable.
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import type { CommandRun } from '../../../../src/ports/index.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { fakeEnvironment, locations, scriptedRunner } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';
import { windowsLocations } from '../../../support/windows-locations.ts';

const userConfigOf = () => ({
  declared: { webhook_url: { type: 'string' as const, title: 'URL', description: 'Where' } },
  values: { webhook_url: 'https://hooks.example.com/a b;$(id)' },
});

/** Runs the handler once against a runner that exits 0 and returns what the port was asked. */
async function ran(
  hook: ReturnType<typeof settingsCommand>,
  options: Partial<Parameters<typeof runContext>[0]> = {},
): Promise<{ call: CommandRun; issues: readonly { severity: string; message: string }[] }> {
  const runner = scriptedRunner({});
  const result = await runHandler(hook, runContext({ runner, ...options }));
  const [call] = runner.calls;
  if (call === undefined) throw new Error('the runner was not called');
  return { call, issues: result.issues };
}

spec('hooks.handler.command.args', () => {
  test('args present runs in exec form: command is the executable, args are the argument vector', async () => {
    const { call } = await ran(
      settingsCommand({ command: 'node', args: ['script.js', '--fix', 'two words'] }),
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['script.js', '--fix', 'two words'],
    });
  });

  test('an empty args array is still exec form (the docs write "args": [])', async () => {
    const { call } = await ran(
      settingsCommand({ command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh', args: [] }),
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: '/work/app/.claude/hooks/check-style.sh',
      args: [],
    });
  });

  test('special characters pass through verbatim: no shell, no tokenization, no quoting', async () => {
    const odd = ["it's", '$HOME', '`id`', '$(id)', 'a;b|c && d', '"q"', '*.ts', ''];
    const { call } = await ran(settingsCommand({ command: 'echo', args: odd }));
    expect(call.spec).toEqual({ form: 'exec', command: 'echo', args: odd });
  });

  test('path placeholders are substituted into command and into each element as plain strings', async () => {
    const { call } = await ran(
      pluginCommand({
        command: '${CLAUDE_PLUGIN_ROOT}/bin/run',
        args: [
          '${CLAUDE_PLUGIN_ROOT}/scripts/format.js',
          '--data=${CLAUDE_PLUGIN_DATA}',
          '${CLAUDE_PROJECT_DIR}',
        ],
      }),
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: '/plugins/formatter@acme-tools/bin/run',
      args: [
        '/plugins/formatter@acme-tools/scripts/format.js',
        '--data=/data/formatter-acme-tools',
        '/work/app',
      ],
    });
  });

  test('a substituted value with spaces or special characters stays one argument', async () => {
    const { call } = await ran(
      pluginCommand({ command: 'notify', args: ['--url', '${user_config.webhook_url}'] }),
      { userConfigOf },
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: 'notify',
      args: ['--url', 'https://hooks.example.com/a b;$(id)'],
    });
  });

  test('${user_config.*} is substituted into command too, as one string', async () => {
    const { call } = await ran(
      pluginCommand({ command: '${user_config.webhook_url}', args: ['--check'] }),
      { userConfigOf },
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: 'https://hooks.example.com/a b;$(id)',
      args: ['--check'],
    });
  });

  test('on Windows the paths are native, as the host reports them', async () => {
    const { call } = await ran(
      pluginCommand({
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/node_modules/eslint/bin/eslint.js'],
      }),
      { locations: windowsLocations(), windows: true },
    );
    expect(call.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: [
        'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools/node_modules/eslint/bin/eslint.js',
      ],
    });
  });

  test('a bare name with whitespace beside args warns: there is no executable named "node script.js"', async () => {
    const { call, issues } = await ran(
      settingsCommand({ command: 'node script.js', args: ['--fix'] }),
    );
    expect(call.spec).toEqual({ form: 'exec', command: 'node script.js', args: ['--fix'] });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('node script.js');
  });

  test('an absolute path with spaces is one valid executable and does not warn', async () => {
    for (const command of ['C:\\Program Files\\nodejs\\node.exe', '/opt/my tools/node']) {
      const { issues } = await ran(settingsCommand({ command, args: [] }));
      expect(issues).toEqual([]);
    }
  });

  test('a bare name without whitespace does not warn', async () => {
    const { issues } = await ran(settingsCommand({ command: 'node', args: ['a b'] }));
    expect(issues).toEqual([]);
  });

  test('the shell field is ignored when args is set', async () => {
    const { call } = await ran(
      settingsCommand({ command: 'pwsh-tool', args: ['-x'], shell: 'powershell' }),
      { defaultShell: 'powershell' },
    );
    expect(call.spec).toEqual({ form: 'exec', command: 'pwsh-tool', args: ['-x'] });
  });
});

spec('hooks.handler.command.command', () => {
  test('with args, command is resolved as an executable and spawned directly', async () => {
    const { call } = await ran(settingsCommand({ command: '/usr/bin/env', args: ['node'] }));
    expect(call.spec.form).toBe('exec');
    expect(call.spec.command).toBe('/usr/bin/env');
  });

  test('without args, command is one string for a shell: pipes, && and quotes are not split', async () => {
    const line = `jq -r '.tool_input.file_path' | xargs prettier --write && echo "done"`;
    const { call } = await ran(settingsCommand({ command: line }));
    expect(call.spec).toEqual({ form: 'shell', command: line, shell: 'bash' });
  });

  test('${CLAUDE_PROJECT_DIR} in a settings hook is the project root, regardless of the working directory', async () => {
    const { call } = await ran(
      settingsCommand({ command: '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/check-style.sh' }),
      { cwd: '/work/app/packages/deep' },
    );
    expect(call.spec).toEqual({
      form: 'shell',
      command: '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/check-style.sh',
      shell: 'bash',
    });
    expect(call.env['CLAUDE_PROJECT_DIR']).toBe('/work/app');
  });

  test('a plugin hook gets ${CLAUDE_PLUGIN_ROOT} and ${CLAUDE_PLUGIN_DATA} in its environment for the shell', async () => {
    const command = '"${CLAUDE_PLUGIN_ROOT}"/scripts/format.sh "${CLAUDE_PLUGIN_DATA}"';
    const { call } = await ran(pluginCommand({ command }));
    expect(call.spec.command).toBe(command);
    expect(call.env).toMatchObject({
      CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
      CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
    });
  });

  test('the process reads the event JSON on stdin', async () => {
    const input = '{"hook_event_name":"PostToolUse","tool_name":"Write"}';
    const { call } = await ran(settingsCommand({ command: './check.sh' }), { input });
    expect(call.stdin).toBe(input);
  });

  test('the process runs in the working directory the session has now', async () => {
    const { call } = await ran(settingsCommand({ command: './check.sh' }), {
      cwd: '/work/app/sub',
      locations: locations({ directories: ['/work/app/sub'] }),
    });
    expect(call.cwd).toBe('/work/app/sub');
  });
});

const CLAUDE_CODE_SETS = { CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1' } as const;

describe('both forms export the placeholders as environment variables', () => {
  const FORMS = [
    ['exec', { command: 'run', args: [] as string[] }],
    ['shell', { command: 'run' }],
  ] as const;

  spec(['hooks.handler.command.args', 'hooks.handler.command.command'], () => {
    for (const [form, hook] of FORMS) {
      test(`a plugin hook in ${form} form receives CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA`, async () => {
        const { call } = await ran(pluginCommand(hook));
        expect(call.env).toMatchObject({
          CLAUDE_PROJECT_DIR: '/work/app',
          CLAUDE_PLUGIN_ROOT: '/plugins/formatter@acme-tools',
          CLAUDE_PLUGIN_DATA: '/data/formatter-acme-tools',
        });
      });

      test(`a plugin hook in ${form} form receives CLAUDE_PLUGIN_OPTION_<KEY> for each option`, async () => {
        const { call } = await ran(pluginCommand(hook), { userConfigOf });
        expect(call.env['CLAUDE_PLUGIN_OPTION_WEBHOOK_URL']).toBe(
          'https://hooks.example.com/a b;$(id)',
        );
      });
    }
  });

  describe('judgment: a handler of no plugin', () => {
    for (const [form, hook] of FORMS) {
      test(`a settings hook in ${form} form receives CLAUDE_PROJECT_DIR and no plugin variable`, async () => {
        const { call } = await ran(settingsCommand(hook), {
          environment: fakeEnvironment({ HOME: '/home/user' }),
        });
        expect(call.env).toEqual({
          HOME: '/home/user',
          CLAUDE_PROJECT_DIR: '/work/app',
          ...CLAUDE_CODE_SETS,
        });
      });
    }
  });

  test('on Windows the exported paths are native, as the host reports them', async () => {
    const { call } = await ran(pluginCommand({ command: 'run' }), {
      locations: windowsLocations(),
      windows: true,
    });
    expect(call.env).toMatchObject({
      CLAUDE_PROJECT_DIR: 'C:\\Users\\you\\app',
      CLAUDE_PLUGIN_ROOT: 'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools',
      CLAUDE_PLUGIN_DATA: 'C:\\Users\\you\\.claude\\plugins\\data\\formatter-acme-tools',
    });
  });
});
