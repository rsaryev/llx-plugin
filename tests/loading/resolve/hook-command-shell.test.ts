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
import { expect, test } from 'bun:test';
import { resolveHookCommand } from '../../../src/index.ts';
import { MESSAGE, hook, resolve, scopeOf, userConfig } from '../../support/hook-scope.ts';
import { spec } from '../../support/spec.ts';

spec('userConfig.shell.Shell-form hook commands', () => {
  test('a shell-form command that references ${user_config.*} does not run, with the errors.md message', async () => {
    const command = './scripts/notify.sh ${user_config.webhook_url}';
    const { resolved, issues } = await resolveHookCommand(hook({ command }), scopeOf());
    expect(resolved).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', path: 'hook.command', message: MESSAGE(command) },
    ]);
  });

  test('the check reads the template: it fires with no value configured and for an undeclared key', async () => {
    const empty = scopeOf({ userConfig: { declared: userConfig.declared, values: {} } });
    for (const key of ['webhook_url', 'api_token', 'never_declared']) {
      const command = `./run \${user_config.${key}}`;
      const { resolved, issues } = await resolveHookCommand(hook({ command }), empty);
      expect(resolved).toBeUndefined();
      expect(issues.map((found) => found.message)).toEqual([MESSAGE(command)]);
    }
  });

  test('a configured value never reaches the shell: a hostile value is not substituted', async () => {
    const hostile = scopeOf({
      userConfig: { declared: userConfig.declared, values: { webhook_url: '$(touch x); `id`' } },
    });
    const { resolved } = await resolveHookCommand(
      hook({ command: 'curl ${user_config.webhook_url}' }),
      hostile,
    );
    expect(resolved).toBeUndefined();
  });

  test('an explicit shell, bash or PowerShell, is shell form too', async () => {
    for (const shell of ['bash', 'powershell'] as const) {
      const { resolved, issues } = await resolveHookCommand(
        hook({ command: 'run ${user_config.webhook_url}', shell }),
        scopeOf(),
      );
      expect(resolved).toBeUndefined();
      expect(issues).toHaveLength(1);
    }
  });

  test('a PowerShell default on the host is shell form too', async () => {
    const { resolved } = await resolveHookCommand(
      hook({ command: 'run ${user_config.webhook_url}' }),
      scopeOf(),
      { defaultShell: 'powershell' },
    );
    expect(resolved).toBeUndefined();
  });

  test('exec form takes it instead: command and each args element, as plain strings no shell re-parses', async () => {
    const hostile = scopeOf({
      userConfig: {
        declared: userConfig.declared,
        values: { webhook_url: '$(touch x); `id` "q"', api_token: 's3cret' },
      },
    });
    const resolved = await resolve(
      hook({
        command: 'notify',
        args: ['${user_config.webhook_url}', '--token=${user_config.api_token}'],
      }),
      hostile,
    );
    expect(resolved.spec).toEqual({
      form: 'exec',
      command: 'notify',
      args: ['$(touch x); `id` "q"', '--token=s3cret'],
    });
  });

  test('exec form: ${user_config.*} in command itself is substituted too', async () => {
    const resolved = await resolve(hook({ command: '${user_config.webhook_url}', args: [] }));
    expect(resolved.spec).toMatchObject({ command: 'https://hooks.example.com' });
  });

  test('the documented way out of a shell-form hook: read $CLAUDE_PLUGIN_OPTION_<KEY> from the environment', async () => {
    const resolved = await resolve(hook({ command: 'curl "$CLAUDE_PLUGIN_OPTION_WEBHOOK_URL"' }));
    expect(resolved.spec).toMatchObject({ command: 'curl "$CLAUDE_PLUGIN_OPTION_WEBHOOK_URL"' });
    expect(resolved.environment.CLAUDE_PLUGIN_OPTION_WEBHOOK_URL).toBe('https://hooks.example.com');
  });

  test('adding args switches a refused hook to exec form: the same reference now runs', async () => {
    const refused = await resolveHookCommand(
      hook({ command: './notify ${user_config.webhook_url}' }),
      scopeOf(),
    );
    expect(refused.resolved).toBeUndefined();
    const resolved = await resolve(
      hook({ command: './notify', args: ['${user_config.webhook_url}'] }),
    );
    expect(resolved.spec).toMatchObject({ form: 'exec', args: ['https://hooks.example.com'] });
  });

  test("the plugin named in the message is the plugin of the scope, and the path is the caller's", async () => {
    const { issues } = await resolveHookCommand(
      hook({ command: 'x ${user_config.webhook_url}' }),
      scopeOf({ pluginId: 'other' }),
      { path: 'hooks.PostToolUse[0].hooks[1]' },
    );
    expect(issues[0]?.path).toBe('hooks.PostToolUse[0].hooks[1].command');
    expect(issues[0]?.message.startsWith('Hook from plugin other references')).toBe(true);
  });
});
