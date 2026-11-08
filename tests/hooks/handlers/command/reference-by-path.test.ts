/**
 * hooks.md § Reference scripts by path (the three placeholders, with the docs' examples) and
 * § Reference scripts by path in PowerShell hooks; plugins/manifest-reference.md § Quoting and path
 * separators.
 */
import { describe, expect, test } from 'bun:test';
import { validatePlugin } from '../../../../src/index.ts';
import { pluginCommand, settingsCommand, skillCommand } from '../../../support/hooks-run.ts';
import { noGitBash, run } from '../../../support/powershell-run.ts';
import { fakeEnvironment, locations, memoryFiles } from '../../../support/ports.ts';
import { spec } from '../../../support/spec.ts';
import { windowsLocations } from '../../../support/windows-locations.ts';

spec('hooks.behavior.Reference scripts by path.${CLAUDE_PROJECT_DIR}', () => {
  test('the docs\' example: ${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh in exec form with "args": []', async () => {
    const { calls } = await run(
      settingsCommand(
        {
          command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh',
          args: [],
        },
        'PostToolUse',
      ),
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: '/work/app/.claude/hooks/check-style.sh',
      args: [],
    });
  });

  test('in shell form each placeholder goes in double quotes, and the path is the project root', async () => {
    const { calls } = await run(
      settingsCommand({
        command: '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/check-style.sh',
      }),
      { locations: locations({ project: '/work/my app' }) },
    );
    expect(calls[0]?.spec.command).toBe('"/work/my app"/.claude/hooks/check-style.sh');
  });

  test('it is also an environment variable of the hook process', async () => {
    const { calls } = await run(settingsCommand({ command: './h.sh' }));
    expect(calls[0]?.env['CLAUDE_PROJECT_DIR']).toBe('/work/app');
  });

  test('in a worktree it stays the root where the session started while cwd follows Claude', async () => {
    const worktree = '/work/app/.claude/worktrees/feature';
    const { calls } = await run(
      settingsCommand({
        command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh',
        args: ['${CLAUDE_PROJECT_DIR}'],
      }),
      {
        cwd: worktree,
        input: JSON.stringify({ cwd: worktree }),
        locations: locations({ directories: [worktree] }),
      },
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: '/work/app/.claude/hooks/check-style.sh',
      args: ['/work/app'],
    });
    expect(calls[0]?.env['CLAUDE_PROJECT_DIR']).toBe('/work/app');
    expect(calls[0]?.cwd).toBe(worktree);
    expect(JSON.parse(calls[0]?.stdin ?? '{}').cwd).toBe(worktree);
  });
});

spec('hooks.behavior.Reference scripts by path.${CLAUDE_PLUGIN_ROOT}', () => {
  test("the docs' example: a script bundled with the plugin, with its timeout", async () => {
    const { calls } = await run(
      pluginCommand({
        command: '${CLAUDE_PLUGIN_ROOT}/scripts/format.sh',
        args: [],
        timeout: 30,
      }),
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: '/plugins/formatter@acme-tools/scripts/format.sh',
      args: [],
    });
    expect(calls[0]?.timeoutMs).toBe(30_000);
  });

  test("it is the plugin's installation directory, as the host reports it, and an environment variable of the process", async () => {
    const { calls } = await run(
      pluginCommand({ command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/format.sh' }),
      {
        locations: locations({ plugins: '/cache/plugins' }),
      },
    );
    expect(calls[0]?.spec.command).toBe('"/cache/plugins/formatter@acme-tools"/scripts/format.sh');
    expect(calls[0]?.env['CLAUDE_PLUGIN_ROOT']).toBe('/cache/plugins/formatter@acme-tools');
  });
});

spec('hooks.behavior.Reference scripts by path.${CLAUDE_PLUGIN_DATA}', () => {
  test("it is the plugin's persistent data directory, the host asked for it, in command, args and the environment", async () => {
    const fake = locations({ data: '/state' });
    const { calls } = await run(
      pluginCommand({
        command: 'node',
        args: ['${CLAUDE_PLUGIN_ROOT}/index.js', '${CLAUDE_PLUGIN_DATA}/cache'],
      }),
      { locations: fake },
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/plugins/formatter@acme-tools/index.js', '/state/formatter-acme-tools/cache'],
    });
    expect(calls[0]?.env['CLAUDE_PLUGIN_DATA']).toBe('/state/formatter-acme-tools');
    expect(fake.dataCreated.length).toBeGreaterThan(0);
  });
});

spec('hooks.behavior.Reference scripts by path in PowerShell hooks', () => {
  const powershell = { shell: 'powershell' } as const;

  test('the three placeholders of a shell-form PowerShell command become ${env:NAME}, whether the hook is in settings.json, a plugin or a skill', async () => {
    const command =
      '& "${CLAUDE_PROJECT_DIR}\\a.ps1" "${CLAUDE_PLUGIN_ROOT}\\b.ps1" "${CLAUDE_PLUGIN_DATA}"';
    const rewritten =
      '& "${env:CLAUDE_PROJECT_DIR}\\a.ps1" "${env:CLAUDE_PLUGIN_ROOT}\\b.ps1" "${env:CLAUDE_PLUGIN_DATA}"';
    for (const hook of [
      settingsCommand({ command, ...powershell }),
      pluginCommand({ command, ...powershell }),
      skillCommand({ command, ...powershell }),
    ]) {
      const { calls } = await run(hook, noGitBash);
      expect(calls[0]?.spec.command).toBe(rewritten);
    }
  });

  test('PowerShell resolves them from the exported environment, which holds the native paths', async () => {
    const { calls } = await run(
      pluginCommand({
        command: '& "${CLAUDE_PLUGIN_ROOT}\\check.ps1"',
        ...powershell,
      }),
      noGitBash,
    );
    expect(calls[0]?.env).toMatchObject({
      CLAUDE_PROJECT_DIR: 'C:\\Users\\you\\app',
      CLAUDE_PLUGIN_ROOT: 'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools',
      CLAUDE_PLUGIN_DATA: 'C:\\Users\\you\\.claude\\plugins\\data\\formatter-acme-tools',
    });
  });

  test("the docs' check.ps1 example, spelled with $env:, runs as written and warns of nothing", async () => {
    const command = '& "$env:CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1"';
    const { calls, result } = await run(settingsCommand({ command, ...powershell }), noGitBash);
    expect(calls[0]?.spec.command).toBe(command);
    expect(result.issues).toEqual([]);
  });

  test('the bare $CLAUDE_PROJECT_DIR is not rewritten, and a warning says why', async () => {
    const command = '& "$CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1"';
    const { calls, result } = await run(settingsCommand({ command, ...powershell }), noGitBash);
    expect(calls[0]?.spec.command).toBe(command);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning' });
    expect(result.issues[0]?.message).toContain('undefined');
  });

  test('a placeholder is rewritten inside double quotes and single quotes alike: PowerShell decides whether it expands', async () => {
    const { calls } = await run(
      settingsCommand({
        command: `Write-Host "\${CLAUDE_PROJECT_DIR}" '\${CLAUDE_PROJECT_DIR}'`,
        ...powershell,
      }),
      noGitBash,
    );
    expect(calls[0]?.spec.command).toBe(
      `Write-Host "\${env:CLAUDE_PROJECT_DIR}" '\${env:CLAUDE_PROJECT_DIR}'`,
    );
  });
});

const plugin = (command: string, hook: object = {}) => pluginCommand({ command, ...hook });

const hooksFile = (handler: object) =>
  JSON.stringify({
    hooks: { PostToolUse: [{ hooks: [{ type: 'command', ...handler }] }] },
  });

const issues = async (handler: object) =>
  (
    await validatePlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          description: 'Demo',
          author: { name: 'A' },
        }),
        'hooks/hooks.json': hooksFile(handler),
      }),
    })
  ).issues.map((issue) => issue.message);

spec('environment.rule.Quoting and path separators', () => {
  const windowsHost = { windows: true, locations: windowsLocations() } as const;
  const ROOT = 'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools';

  test('hook commands: exec form with args passes each path as one argument with no quoting', async () => {
    const { calls } = await run(
      plugin('node', {
        args: ['${CLAUDE_PLUGIN_ROOT}/scripts/a b.js', '${CLAUDE_PROJECT_DIR}'],
      }),
      { locations: locations({ plugins: '/p q' }) },
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/p q/formatter@acme-tools/scripts/a b.js', '/work/app'],
    });
  });

  test("shell-form hooks: the docs' example, the variable wrapped in double quotes, keeps a path with spaces one word", async () => {
    const { calls } = await run(plugin('"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh'), {
      locations: locations({ plugins: '/Users/ann smith/plugins' }),
    });
    expect(calls[0]?.spec.command).toBe(
      '"/Users/ann smith/plugins/formatter@acme-tools"/scripts/process.sh',
    );
  });

  test('on Windows most substituted paths use forward slashes, as in C:/Users/you/...', async () => {
    const { calls } = await run(
      plugin('"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh "${CLAUDE_PROJECT_DIR}"'),
      windowsHost,
    );
    expect(calls[0]?.spec.command).toBe(
      '"C:/Users/you/.claude/plugins/cache/formatter@acme-tools"/scripts/process.sh "C:/Users/you/app"',
    );
  });

  test('they keep their native backslashes in an exec-form hook', async () => {
    const { calls } = await run(
      plugin('${CLAUDE_PLUGIN_ROOT}\\run.exe', {
        args: ['${CLAUDE_PROJECT_DIR}'],
      }),
      windowsHost,
    );
    expect(calls[0]?.spec).toEqual({
      form: 'exec',
      command: `${ROOT}\\run.exe`,
      args: ['C:\\Users\\you\\app'],
    });
  });

  test('and in a hook that runs through PowerShell, where the variable holds the native path', async () => {
    const { calls } = await run(plugin('& "${CLAUDE_PLUGIN_ROOT}\\run.ps1"'), {
      ...windowsHost,
      defaultShell: 'powershell',
    });
    expect(calls[0]?.spec.command).toBe('& "${env:CLAUDE_PLUGIN_ROOT}\\run.ps1"');
    expect(calls[0]?.env['CLAUDE_PLUGIN_ROOT']).toBe(ROOT);
  });

  test('plugin validate warns of a variable left outside quotes in a shell-form command of a hooks file, unless the hook sets "shell": "powershell"', async () => {
    const loose = await issues({
      command: '${CLAUDE_PLUGIN_ROOT}/scripts/process.sh',
    });
    expect(loose).toHaveLength(1);
    expect(loose[0]).toContain('without quotes');
    expect(await issues({ command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh' })).toEqual([]);
    expect(
      await issues({
        command: 'p ${CLAUDE_PLUGIN_ROOT}/x',
        shell: 'powershell',
      }),
    ).toEqual([]);
    expect(await issues({ command: '${CLAUDE_PLUGIN_ROOT}/x.sh', args: [] })).toEqual([]);
  });
});

describe('the environment of a PowerShell hook still has what the placeholders name', () => {
  test('an inherited environment passes through beside it', async () => {
    const { calls } = await run(settingsCommand({ command: 'Write-Host x', shell: 'powershell' }), {
      ...noGitBash,
      environment: fakeEnvironment({ USERPROFILE: 'C:\\Users\\you' }),
    });
    expect(calls[0]?.env['USERPROFILE']).toBe('C:\\Users\\you');
  });
});
