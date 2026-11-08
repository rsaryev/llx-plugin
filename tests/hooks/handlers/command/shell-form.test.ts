/**
 * hooks.md § Hook handler fields, "Command hook fields" (`shell`: "Accepts "bash" or "powershell".
 * Defaults to "bash", or to "powershell" on Windows when Git Bash isn't installed ... Ignored when
 * `args` is set") and "Exec form and shell form" (shell form runs when `args` is absent; a
 * shell-form plugin hook whose `command` references `${user_config.*}` "fails with an error
 * instead of running"); § Windows PowerShell tool and "Reference scripts by path in PowerShell
 * hooks" (the placeholders are rewritten to `${env:NAME}`, the bare `$CLAUDE_PROJECT_DIR` form is
 * not and logs a warning); errors.md § Plugin command references user_config in a shell command
 * (the message, "the error appears even when no value is configured yet").
 */
import { describe, expect, test } from 'bun:test';
import { runHandler } from '../../../../src/hooks/handlers/index.ts';
import { pluginCommand, runContext, settingsCommand } from '../../../support/hooks-run.ts';
import { locations, scriptedRunner } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';
import { windowsLocations } from '../../../support/windows-locations.ts';

async function run(
  hook: ReturnType<typeof settingsCommand>,
  options: Partial<Parameters<typeof runContext>[0]> = {},
) {
  const runner = scriptedRunner({});
  const result = await runHandler(hook, runContext({ runner, ...options }));
  return { result, calls: runner.calls };
}

spec(
  [
    'hooks.handler.command.shell',
    'tools.behavior.Shell selection in settings, hooks, and skills."shell": "powershell"',
  ],
  () => {
    test('defaults to bash', async () => {
      const { calls } = await run(settingsCommand({ command: 'echo hi' }));
      expect(calls[0]?.spec).toEqual({ form: 'shell', command: 'echo hi', shell: 'bash' });
    });

    test('"powershell" runs the command through PowerShell', async () => {
      const { calls } = await run(
        settingsCommand({ command: "Write-Host 'File written'", shell: 'powershell' }),
      );
      expect(calls[0]?.spec).toEqual({
        form: 'shell',
        command: "Write-Host 'File written'",
        shell: 'powershell',
      });
    });

    test('"bash" is chosen explicitly even where the host default is PowerShell', async () => {
      const { calls } = await run(settingsCommand({ command: 'echo hi', shell: 'bash' }), {
        defaultShell: 'powershell',
      });
      expect(calls[0]?.spec).toEqual({ form: 'shell', command: 'echo hi', shell: 'bash' });
    });

    test('is ignored when args is set: exec form has no shell', async () => {
      const { calls } = await run(
        settingsCommand({ command: 'tool', args: ['a'], shell: 'powershell' }),
      );
      expect(calls[0]?.spec).toEqual({ form: 'exec', command: 'tool', args: ['a'] });
    });

    describe('PowerShell placeholders', () => {
      const powershell = { shell: 'powershell' } as const;

      test('the three placeholders become ${env:NAME}, left for PowerShell to resolve', async () => {
        const { calls } = await run(
          pluginCommand({
            ...powershell,
            command:
              'Write-Host "${CLAUDE_PROJECT_DIR} ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_DATA}"',
          }),
        );
        expect(calls[0]?.spec).toEqual({
          form: 'shell',
          shell: 'powershell',
          command:
            'Write-Host "${env:CLAUDE_PROJECT_DIR} ${env:CLAUDE_PLUGIN_ROOT} ${env:CLAUDE_PLUGIN_DATA}"',
        });
      });

      test('a settings hook is rewritten the same way', async () => {
        const { calls } = await run(
          settingsCommand({
            ...powershell,
            command: '& "${CLAUDE_PROJECT_DIR}\\.claude\\hooks\\check.ps1"',
          }),
        );
        expect(calls[0]?.spec.command).toBe(
          '& "${env:CLAUDE_PROJECT_DIR}\\.claude\\hooks\\check.ps1"',
        );
      });

      test('the $env: spelling is left as written and does not warn', async () => {
        const command = '& "$env:CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1"';
        const { calls, result } = await run(settingsCommand({ ...powershell, command }));
        expect(calls[0]?.spec.command).toBe(command);
        expect(result.issues).toEqual([]);
      });

      test('the bare $CLAUDE_PROJECT_DIR spelling is not rewritten and warns', async () => {
        const command = '& "$CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1"';
        const { calls, result } = await run(settingsCommand({ ...powershell, command }));
        expect(calls[0]?.spec.command).toBe(command);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.severity).toBe('warning');
        expect(result.issues[0]?.message).toContain('CLAUDE_PROJECT_DIR');
      });

      test('the bare spelling is no problem for bash', async () => {
        const { result } = await run(
          settingsCommand({ command: '"$CLAUDE_PROJECT_DIR"/check.sh' }),
        );
        expect(result.issues).toEqual([]);
      });
    });
  },
);

describe('judgment: the shell of a hook with no shell field', () => {
  test('is the host default: finding Git Bash is the host, so the kit takes its word', async () => {
    for (const defaultShell of ['bash', 'powershell'] as const) {
      const { calls } = await run(settingsCommand({ command: 'echo hi' }), { defaultShell });
      expect(calls[0]?.spec).toEqual({ form: 'shell', command: 'echo hi', shell: defaultShell });
    }
  });

  test('an explicit shell is not the host default', async () => {
    const { calls } = await run(settingsCommand({ command: 'echo hi', shell: 'powershell' }), {
      defaultShell: 'bash',
    });
    expect(calls[0]?.spec).toEqual({ form: 'shell', command: 'echo hi', shell: 'powershell' });
  });
});

describe('Git Bash on Windows', () => {
  test('the path placeholders of a shell-form command use forward slashes', async () => {
    const { calls } = await run(
      pluginCommand({ command: '"${CLAUDE_PLUGIN_ROOT}/bin/run" "${CLAUDE_PROJECT_DIR}"' }),
      { locations: windowsLocations(), windows: true },
    );
    expect(calls[0]?.spec).toEqual({
      form: 'shell',
      shell: 'bash',
      command:
        '"C:/Users/you/.claude/plugins/cache/formatter@acme-tools/bin/run" "C:/Users/you/app"',
    });
  });
});

spec(['hooks.handler.command.command', 'hooks.handler.command.shell'], () => {
  describe('a shell-form plugin hook that references ${user_config.*}', () => {
    const command = './scripts/notify.sh ${user_config.webhook_url}';

    const message =
      'Hook from plugin formatter@acme-tools references ${user_config.*} in a shell-form command. ' +
      'The substituted value would be re-parsed by the shell. Use exec form instead — ' +
      '{"command": "<executable>", "args": ["${user_config.KEY}", ...]} — ' +
      "or read $CLAUDE_PLUGIN_OPTION_<KEY> from the hook's environment. " +
      `Command: ${command}`;

    test('fails with the documented error instead of running', async () => {
      const { result, calls } = await run(pluginCommand({ command }));
      expect(calls).toHaveLength(0);
      expect(result.issues).toEqual([
        { severity: 'error', path: 'hooks.PostToolUse.command', message },
      ]);
    });

    test('judgment: is reported as a skipped run carrying the message, not a not-started one', async () => {
      const { result } = await run(pluginCommand({ command }));
      expect(result.run).toEqual({ kind: 'skipped', reason: message });
    });

    test('fails even when no value is configured yet: the check reads the template', async () => {
      const { result, calls } = await run(pluginCommand({ command }), {
        userConfigOf: () => ({ declared: {}, values: {} }),
      });
      expect(calls).toHaveLength(0);
      expect(result.issues.map(({ severity }) => severity)).toEqual(['error']);
    });

    test('fails under PowerShell too', async () => {
      const { calls, result } = await run(pluginCommand({ command, shell: 'powershell' }));
      expect(calls).toHaveLength(0);
      expect(result.run.kind).toBe('skipped');
      expect(result.issues.map(({ severity }) => severity)).toEqual(['error']);
    });

    test('runs in exec form once args is set, with the value as one argument', async () => {
      const { calls, result } = await run(
        pluginCommand({ command: './scripts/notify.sh', args: ['${user_config.webhook_url}'] }),
        {
          userConfigOf: () => ({
            declared: { webhook_url: { type: 'string', title: 'u', description: 'd' } },
            values: { webhook_url: 'https://x.test' },
          }),
        },
      );
      expect(result.run.kind).toBe('exited');
      expect(calls[0]?.spec).toEqual({
        form: 'exec',
        command: './scripts/notify.sh',
        args: ['https://x.test'],
      });
    });

    test('the option is read from the environment instead, in shell form', async () => {
      const { calls } = await run(
        pluginCommand({ command: './scripts/notify.sh "$CLAUDE_PLUGIN_OPTION_WEBHOOK_URL"' }),
        {
          userConfigOf: () => ({
            declared: { webhook_url: { type: 'string', title: 'u', description: 'd' } },
            values: { webhook_url: 'https://x.test' },
          }),
        },
      );
      expect(calls[0]?.spec.form).toBe('shell');
      expect(calls[0]?.env['CLAUDE_PLUGIN_OPTION_WEBHOOK_URL']).toBe('https://x.test');
    });
  });
});

describe('judgment: a hook of a settings file', () => {
  test('is not a plugin hook: it runs, the ${user_config.*} text untouched', async () => {
    const command = './scripts/notify.sh ${user_config.webhook_url}';
    const { calls } = await run(settingsCommand({ command }));
    expect(calls[0]?.spec.command).toBe(command);
  });

  test('under PowerShell its plugin placeholders are rewritten, and no such variable is exported', async () => {
    const { calls } = await run(
      settingsCommand({
        shell: 'powershell',
        command: 'Write-Host "${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_DATA}"',
      }),
    );
    expect(calls[0]?.spec.command).toBe(
      'Write-Host "${env:CLAUDE_PLUGIN_ROOT} ${env:CLAUDE_PLUGIN_DATA}"',
    );
    expect(Object.keys(calls[0]?.env ?? {}).toSorted()).toEqual([
      'CLAUDECODE',
      'CLAUDE_CODE_CHILD_SESSION',
      'CLAUDE_PROJECT_DIR',
    ]);
  });
});

// Judgment (spec/judgments.md): `shellPaths: 'environment-reference'` keeps a bash command's path
// variables for the shell to read from the hook's environment, so a folder name is never shell.
describe('shellPaths environment-reference', () => {
  test('a bash command keeps ${CLAUDE_PROJECT_DIR}, and the environment carries the path', async () => {
    const { calls } = await run(settingsCommand({ command: '"${CLAUDE_PROJECT_DIR}"/h.sh' }), {
      locations: locations({ project: '/work/x$(touch PWNED)' }),
      shellPaths: 'environment-reference',
    });
    expect(calls[0]?.spec.command).toBe('"${CLAUDE_PROJECT_DIR}"/h.sh');
    expect(calls[0]?.env['CLAUDE_PROJECT_DIR']).toBe('/work/x$(touch PWNED)');
  });
});
