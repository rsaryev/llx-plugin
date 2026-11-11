/**
 * plugins/manifest-reference.md § Where each variable resolves (Hook commands: `${...}` "Anywhere in
 * `command` and `args`"; exported: the three path variables and `CLAUDE_PLUGIN_OPTION_<KEY>"),
 * § Reference a saved value, § Fields that run through a shell (shell-form hook commands reject
 * `${user_config.*}`), § Quoting and path separators; hooks.md § Exec form and shell form (exec form
 * substitutes into `command` and each `args` element as plain strings, shell form never takes
 * `${user_config.*}`, `shell` is ignored when `args` is set), § Reference scripts by path in
 * PowerShell hooks; errors.md § Plugin command references user_config in a shell command (the
 * shell-form hook message, and "The check runs on the command template"); plugins/components.md
 * § Environment, quoting, and matching MCP tools.
 *
 * The kit never spawns the process: the resolved hook is the `CommandSpec` and environment the host
 * hands its `CommandRunner`.
 */
import { describe, expect, test } from 'bun:test';
import { resolveHookCommand } from '../../../src/entry/loading.ts';
import { PATHS, hook, resolve, scopeOf, userConfig } from '../../support/hook-scope.ts';
import { locations } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { windowsLocations } from '../../support/windows-locations.ts';

spec('environment.component.Hook commands', () => {
  test('exec form: the three path variables resolve in command and in every args element', async () => {
    const resolved = await resolve(
      hook({
        command: '${CLAUDE_PLUGIN_ROOT}/bin/run',
        args: [
          '${CLAUDE_PLUGIN_ROOT}/scripts/format.js',
          '--fix',
          '--data=${CLAUDE_PLUGIN_DATA}/x',
        ],
      }),
    );
    expect(resolved.spec).toEqual({
      form: 'exec',
      command: `${PATHS.CLAUDE_PLUGIN_ROOT}/bin/run`,
      args: [
        `${PATHS.CLAUDE_PLUGIN_ROOT}/scripts/format.js`,
        '--fix',
        `--data=${PATHS.CLAUDE_PLUGIN_DATA}/x`,
      ],
    });
  });

  test('the hooks.md example: node with a bundled script is one argument, no quoting', async () => {
    const resolved = await resolve(
      hook({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/format.js', '--fix'] }),
    );
    expect(resolved.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: [`${PATHS.CLAUDE_PLUGIN_ROOT}/scripts/format.js`, '--fix'],
    });
  });

  test('exec form: an empty args list is still exec form (the hooks.md project-script example)', async () => {
    const resolved = await resolve(
      hook({ command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh', args: [] }),
    );
    expect(resolved.spec).toEqual({
      form: 'exec',
      command: `${PATHS.CLAUDE_PROJECT_DIR}/.claude/hooks/check-style.sh`,
      args: [],
    });
  });

  test('exec form: a path with spaces stays one argument, and shell characters pass through verbatim', async () => {
    const host = locations({ plugins: '/Users/the user/plugins' });
    const resolved = await resolve(
      hook({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/a b.js', "it's $HOME `id` $(x)"] }),
      scopeOf({ locations: host }),
    );
    expect(resolved.spec).toEqual({
      form: 'exec',
      command: 'node',
      args: ['/Users/the user/plugins/formatter@acme-tools/a b.js', "it's $HOME `id` $(x)"],
    });
  });

  test('shell form: the variables resolve anywhere in command, every occurrence', async () => {
    const resolved = await resolve(
      hook({
        command:
          'diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" || (cd "${CLAUDE_PLUGIN_DATA}" && cp "${CLAUDE_PLUGIN_ROOT}/package.json" .)',
      }),
    );
    // oracle 2.1.322: Claude Code leaves the references; the shell reads them from the environment.
    expect(resolved.spec).toEqual({
      form: 'shell',
      shell: 'bash',
      command:
        'diff -q "${CLAUDE_PLUGIN_ROOT}/package.json" "${CLAUDE_PLUGIN_DATA}/package.json" || (cd "${CLAUDE_PLUGIN_DATA}" && cp "${CLAUDE_PLUGIN_ROOT}/package.json" .)',
    });
    expect(resolved.environment).toMatchObject(PATHS);
  });

  test('shell form: the manifest-reference example, a quoted variable followed by a path', async () => {
    const resolved = await resolve(
      hook({ command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh' }),
      scopeOf({ shellPaths: 'pasted' }),
    );
    // `pasted` pastes where Claude Code pastes, and it never pastes into a hook.
    expect(resolved.spec).toEqual({
      form: 'shell',
      shell: 'bash',
      command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/process.sh',
    });
    expect(resolved.environment.CLAUDE_PLUGIN_ROOT).toBe(PATHS.CLAUDE_PLUGIN_ROOT);
  });

  test('the process gets the three path variables and one option variable per option, sensitive included, in both forms', async () => {
    const expected = {
      ...PATHS,
      CLAUDE_PLUGIN_OPTION_WEBHOOK_URL: 'https://hooks.example.com',
      CLAUDE_PLUGIN_OPTION_API_TOKEN: 's3cret',
    };
    expect((await resolve(hook({ command: './run.sh' }))).environment).toEqual(expected);
    expect((await resolve(hook({ command: './run', args: [] }))).environment).toEqual(expected);
  });

  test('a hook that references nothing still gets the data folder created and exported', async () => {
    const host = locations();
    await resolve(hook({ command: './run.sh' }), scopeOf({ locations: host }));
    expect(host.dataCreated).toContain('formatter-acme-tools');
  });

  test('a value is substituted once: a path variable inside an option value stays that text', async () => {
    const scope = scopeOf({
      userConfig: { ...userConfig, values: { webhook_url: '${CLAUDE_PLUGIN_ROOT}' } },
    });
    const resolved = await resolve(
      hook({ command: 'echo', args: ['${user_config.webhook_url}'] }),
      scope,
    );
    expect(resolved.spec).toMatchObject({ args: ['${CLAUDE_PLUGIN_ROOT}'] });
  });

  test('${VAR} is left to the process: nothing in the docs expands it for a hook', async () => {
    const resolved = await resolve(hook({ command: 'echo "${NODE_ENV}"' }));
    expect(resolved.spec).toMatchObject({ command: 'echo "${NODE_ENV}"' });
  });

  describe('on Windows (manifest-reference § Quoting and path separators)', () => {
    const windows = scopeOf({ locations: windowsLocations(), windows: true });
    const ROOT = 'C:\\Users\\you\\.claude\\plugins\\cache\\formatter@acme-tools';

    test('an exec-form hook keeps native backslashes in command, args and its environment', async () => {
      const resolved = await resolve(
        hook({ command: '${CLAUDE_PLUGIN_ROOT}\\bin\\run.exe', args: ['${CLAUDE_PROJECT_DIR}'] }),
        windows,
      );
      expect(resolved.spec).toEqual({
        form: 'exec',
        command: `${ROOT}\\bin\\run.exe`,
        args: ['C:\\Users\\you\\app'],
      });
      expect(resolved.environment.CLAUDE_PROJECT_DIR).toBe('C:\\Users\\you\\app');
    });

    test('a shell-form hook through bash keeps the reference; its environment has the native path', async () => {
      const resolved = await resolve(
        hook({ command: '"${CLAUDE_PROJECT_DIR}"/run.sh', shell: 'bash' }),
        windows,
      );
      expect(resolved.spec).toEqual({
        form: 'shell',
        shell: 'bash',
        command: '"${CLAUDE_PROJECT_DIR}"/run.sh',
      });
      expect(resolved.environment.CLAUDE_PROJECT_DIR).toBe('C:\\Users\\you\\app');
    });

    test('a PowerShell hook gets the placeholders rewritten to ${env:NAME}, in double-quoted strings too', async () => {
      const resolved = await resolve(
        hook({
          command:
            '& "${CLAUDE_PROJECT_DIR}\\.claude\\hooks\\check.ps1" ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_DATA}',
          shell: 'powershell',
        }),
        windows,
      );
      expect(resolved.spec).toEqual({
        form: 'shell',
        shell: 'powershell',
        command:
          '& "${env:CLAUDE_PROJECT_DIR}\\.claude\\hooks\\check.ps1" ${env:CLAUDE_PLUGIN_ROOT} ${env:CLAUDE_PLUGIN_DATA}',
      });
    });

    test('a hook with no shell runs in the shell the host says is its default', async () => {
      const handler = hook({ command: 'echo "${CLAUDE_PROJECT_DIR}"' });
      const { resolved } = await resolveHookCommand(handler, windows, {
        defaultShell: 'powershell',
      });
      expect(resolved?.spec).toEqual({
        form: 'shell',
        shell: 'powershell',
        command: 'echo "${env:CLAUDE_PROJECT_DIR}"',
      });
    });
  });
});
