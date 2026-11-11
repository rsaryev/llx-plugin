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
import { hook, PATHS, resolve, scopeOf } from '../../support/hook-scope.ts';
import { locations } from '../../support/ports.ts';
import { windowsLocations } from '../../support/windows-locations.ts';

describe('hook resolution (hooks.md, judgments in spec/judgments.md)', () => {
  test('shell is ignored when args is set: a PowerShell hook with args is exec form, native paths', async () => {
    const resolved = await resolve(
      hook({ command: 'run', args: ['${CLAUDE_PROJECT_DIR}'], shell: 'powershell' }),
      scopeOf({ locations: windowsLocations(), windows: true }),
    );
    expect(resolved.spec).toEqual({ form: 'exec', command: 'run', args: ['C:\\Users\\you\\app'] });
  });

  test('exec form: a bare command name with whitespace next to args warns that the spawn will fail', async () => {
    const { resolved, issues } = await resolveHookCommand(
      hook({ command: 'node script.js', args: ['--fix'] }),
      scopeOf(),
    );
    expect(resolved?.spec).toMatchObject({ command: 'node script.js' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', path: 'hook.command' });
    expect(issues[0]?.message).toContain('node script.js');
  });

  test('exec form: an absolute path with spaces is one valid executable and does not warn', async () => {
    for (const command of ['C:\\Program Files\\nodejs\\node.exe', '/opt/my tools/run']) {
      const { issues } = await resolveHookCommand(hook({ command, args: [] }), scopeOf());
      expect(issues).toEqual([]);
    }
  });

  test('exec form: the warning looks at the resolved command, so a variable that supplies the path does not warn', async () => {
    const host = locations({ plugins: '/Users/the user/plugins' });
    const { issues } = await resolveHookCommand(
      hook({ command: '${CLAUDE_PLUGIN_ROOT}', args: [] }),
      scopeOf({ locations: host }),
    );
    expect(issues).toEqual([]);
  });

  test('shell form never warns about whitespace in command', async () => {
    const { issues } = await resolveHookCommand(
      hook({ command: 'node script.js --fix' }),
      scopeOf(),
    );
    expect(issues).toEqual([]);
  });

  test('PowerShell: the bare $CLAUDE_PROJECT_DIR spelling is left as written and reported; ${...} and $env: are not', async () => {
    const bare = await resolveHookCommand(
      hook({ command: '& "$CLAUDE_PROJECT_DIR\\check.ps1"', shell: 'powershell' }),
      scopeOf(),
    );
    expect(bare.resolved?.spec).toMatchObject({ command: '& "$CLAUDE_PROJECT_DIR\\check.ps1"' });
    expect(bare.issues).toHaveLength(1);
    expect(bare.issues[0]).toMatchObject({ severity: 'warning', path: 'hook.command' });
    for (const command of [
      '& "${CLAUDE_PROJECT_DIR}\\check.ps1"',
      '& "$env:CLAUDE_PROJECT_DIR\\check.ps1"',
    ]) {
      const fine = await resolveHookCommand(hook({ command, shell: 'powershell' }), scopeOf());
      expect(fine.issues).toEqual([]);
    }
  });

  test('bash: $CLAUDE_PROJECT_DIR is the environment variable the shell reads, no warning', async () => {
    const { resolved, issues } = await resolveHookCommand(
      hook({ command: '"$CLAUDE_PROJECT_DIR"/check.sh' }),
      scopeOf(),
    );
    expect(issues).toEqual([]);
    expect(resolved?.spec).toMatchObject({ command: '"$CLAUDE_PROJECT_DIR"/check.sh' });
  });

  test('by default (shellPaths environment-reference) bash path variables stay for the shell, in the environment', async () => {
    const { resolved } = await resolveHookCommand(
      hook({ command: '"${CLAUDE_PLUGIN_ROOT}/x.sh" ${CLAUDE_PROJECT_DIR}' }),
      scopeOf(),
    );
    expect(resolved?.spec).toMatchObject({
      command: '"${CLAUDE_PLUGIN_ROOT}/x.sh" ${CLAUDE_PROJECT_DIR}',
    });
    expect(resolved?.environment).toMatchObject({
      CLAUDE_PLUGIN_ROOT: PATHS.CLAUDE_PLUGIN_ROOT,
      CLAUDE_PROJECT_DIR: PATHS.CLAUDE_PROJECT_DIR,
    });
  });

  test('a variable the host cannot resolve is a warning and stays as written', async () => {
    const { resolved, issues } = await resolveHookCommand(
      hook({ command: 'run', args: ['${user_config.missing}'] }),
      scopeOf(),
      { path: 'h' },
    );
    expect(resolved?.spec).toMatchObject({ args: ['${user_config.missing}'] });
    expect(issues).toEqual([
      {
        severity: 'warning',
        path: 'h.args[0]',
        message: '${user_config.missing} is not declared in userConfig',
      },
    ]);
  });
});
