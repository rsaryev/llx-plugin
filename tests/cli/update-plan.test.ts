/**
 * plugins/cli-reference.md § plugin update: "Claude Code prints `Checking for updates for plugin
 * "formatter@my-marketplace"…`, then the result. When nothing is newer, it prints `formatter is
 * already at the latest version (1.0.0).` and exits `0`"; § Which scope the command updates ("If you
 * omit `--scope`, the command updates the plugin at the most specific scope it's installed at for your
 * current project, checking local, project, user, then managed"; `managed` is the one scope you can
 * update but not install to; before v2.1.281 "`Plugin "<name>" is not installed at scope user`");
 * § Update by bare name ("matches against your installed plugins. When installed plugins from
 * different marketplaces share the name, the command refuses the update and lists the qualified
 * `plugin-name@marketplace-name` commands"); § Retry an unfinished dependency install ("When the
 * plugin is already at its latest version, the command can also retry an unfinished dependency install
 * in its cached copy ... If the retry fails, the output is `Failed to update plugin
 * "formatter@my-marketplace"` with the reason and the exit code is `1`"); plugins/troubleshooting.md
 * § The packages it lists are not installed (the retry is skipped under
 * `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` and for a plugin whose install cannot run). The success
 * line of a newer version and the failure wording are outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { InstallScope } from '../../src/marketplace/install-scopes.ts';
import { concludeRetry } from '../../src/cli/update-plan.ts';
import { install, outputOf, shown, update } from '../support/update.ts';
import { spec } from '../support/spec.ts';

const current = (extra = {}) =>
  install('formatter@m', { installed: '1.0.0', offered: '1.0.0' }, extra);

describe('plugin update: the result', () => {
  test('prints Checking for updates ahead of the result', async () => {
    const found = await update({ installs: [current()] });
    expect(found.before).toEqual(['Checking for updates for plugin "formatter@m"…']);
  });

  test('a newer version is updated and the host is told which', async () => {
    const found = await update({
      installs: [install('formatter@m', { installed: '1.0.0', offered: '1.1.0' })],
    });
    expect('update' in found && found.update).toEqual({
      id: 'formatter@m',
      scope: 'user',
      from: '1.0.0',
      to: '1.1.0',
    });
    expect(shown(found).stdout.at(-1)).toContain('formatter to version 1.1.0');
  });

  test('nothing newer prints <name> is already at the latest version (<version>). and exits 0', async () => {
    const found = await update({ installs: [current()] });
    expect(shown(found)).toEqual({
      stdout: [
        'Checking for updates for plugin "formatter@m"…',
        'formatter is already at the latest version (1.0.0).',
      ],
      stderr: [],
      exitCode: 0,
    });
    expect('update' in found).toBe(false);
  });

  test('a plugin that is not installed fails with exit 1', async () => {
    const found = await update({ installs: [], args: { plugin: 'nothing' } });
    expect(shown(found).exitCode).toBe(1);
    expect(shown(found).stderr[0]).toStartWith('Failed to update plugin "nothing":');
  });

  test('--json prints the result object with pluginId and scope', async () => {
    const found = await update({ installs: [current()], args: { json: true } });
    expect(JSON.parse(shown(found, true).stdout.at(-1) ?? '')).toEqual({
      command: 'update',
      outcome: 'ok',
      pluginId: 'formatter@m',
      scope: 'user',
      message: 'formatter is already at the latest version (1.0.0).',
    });
  });
});

const everywhere = (scopes: readonly InstallScope[]) =>
  scopes.map((scope) =>
    install('formatter@m', { installed: '1.0.0', offered: '1.1.0' }, { scope }),
  );

spec('cli.plugin.Which scope the command updates', () => {
  test('without --scope it updates at the most specific scope, checking local, project, user, then managed', async () => {
    const found = await update({ installs: everywhere(['user', 'project', 'managed']) });
    expect('update' in found && found.update?.scope).toBe('project');
    const local = await update({ installs: everywhere(['user', 'local', 'project']) });
    expect('update' in local && local.update?.scope).toBe('local');
    const user = await update({ installs: everywhere(['managed', 'user']) });
    expect('update' in user && user.update?.scope).toBe('user');
  });

  test('a plugin installed only at project or local scope updates without --scope', async () => {
    const found = await update({ installs: everywhere(['project']) });
    expect('update' in found && found.update?.scope).toBe('project');
    expect(shown(found).exitCode).toBe(0);
  });

  test('managed is the one scope you can update but not install to', async () => {
    const found = await update({ installs: everywhere(['managed']), args: { scope: 'managed' } });
    expect('update' in found && found.update?.scope).toBe('managed');
    const refused = await update({ installs: everywhere(['user']), args: { scope: 'team' } });
    expect(outputOf(refused)).toMatchObject({ kind: 'usage-error' });
  });

  test('--scope names the scope to update, whatever else the plugin is installed at', async () => {
    const found = await update({
      installs: everywhere(['local', 'user']),
      args: { scope: 'user' },
    });
    expect('update' in found && found.update?.scope).toBe('user');
  });

  test('a plugin not installed at the scope named fails with is not installed at scope <scope>', async () => {
    const found = await update({ installs: everywhere(['project']), args: { scope: 'user' } });
    expect(shown(found).stderr[0]).toContain('Plugin "formatter@m" is not installed at scope user');
    expect(shown(found).exitCode).toBe(1);
  });
});

spec('cli.plugin.Update by bare name', () => {
  test('matches a bare name against the installed plugins', async () => {
    const found = await update({
      args: { plugin: 'formatter' },
      installs: [install('formatter@m', { installed: '1.0.0', offered: '1.1.0' })],
    });
    expect('update' in found && found.update?.id).toBe('formatter@m');
  });

  test('refuses when installed plugins from different marketplaces share the name and lists the qualified commands', async () => {
    const found = await update({
      args: { plugin: 'formatter' },
      installs: [
        install('formatter@a', { installed: '1.0.0', offered: '1.1.0' }),
        install('formatter@b', { installed: '1.0.0', offered: '1.1.0' }),
      ],
    });
    const out = shown(found);
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toContain('claude plugin update formatter@a');
    expect(out.stderr[0]).toContain('claude plugin update formatter@b');
    expect('update' in found).toBe(false);
  });

  test('the qualified name picks one of them', async () => {
    const found = await update({
      args: { plugin: 'formatter@b' },
      installs: [
        install('formatter@a', { installed: '1.0.0', offered: '1.1.0' }),
        install('formatter@b', { installed: '1.0.0', offered: '1.1.0' }),
      ],
    });
    expect('update' in found && found.update?.id).toBe('formatter@b');
  });

  test('the same plugin installed at two scopes is not ambiguous', async () => {
    const found = await update({
      args: { plugin: 'formatter' },
      installs: [
        install('formatter@a', { installed: '1.0.0', offered: '1.1.0' }, { scope: 'user' }),
        install('formatter@a', { installed: '1.0.0', offered: '1.1.0' }, { scope: 'project' }),
      ],
    });
    expect('update' in found && found.update?.scope).toBe('project');
  });
});

spec('cli.plugin.Retry an unfinished dependency install', () => {
  const unfinished = current({ dependencyInstall: 'unfinished' });

  test('a plugin at its latest version with an unfinished dependency install retries it in the cached copy', async () => {
    const found = await update({ installs: [unfinished] });
    expect('retry' in found && found.retry).toMatchObject({ id: 'formatter@m', scope: 'user' });
  });

  test('when the retry succeeds the command prints the latest version and exits 0', async () => {
    const found = await update({ installs: [unfinished] });
    if (!('retry' in found)) throw new Error('expected a retry');
    expect(shown(concludeRetry(found.retry, { ok: true }))).toMatchObject({
      stdout: expect.arrayContaining(['formatter is already at the latest version (1.0.0).']),
      exitCode: 0,
    });
  });

  test('when the retry fails the output is Failed to update plugin with the reason and the exit code is 1', async () => {
    const found = await update({ installs: [unfinished] });
    if (!('retry' in found)) throw new Error('expected a retry');
    const out = shown(
      concludeRetry(found.retry, { ok: false, reason: 'npm install exited with 1' }),
    );
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toEqual([
      'Failed to update plugin "formatter@m": npm install exited with 1',
    ]);
  });

  test('a finished dependency install is not retried', async () => {
    const found = await update({ installs: [current()] });
    expect('retry' in found).toBe(false);
  });

  test('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC skips the retry and reports the latest version', async () => {
    const found = await update({
      installs: [unfinished],
      env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    });
    expect('retry' in found).toBe(false);
    expect(shown(found).exitCode).toBe(0);
  });

  test('an install that cannot run (a lockfile of another package manager) is not retried', async () => {
    const found = await update({ installs: [current({ dependencyInstall: 'cannot-run' })] });
    expect('retry' in found).toBe(false);
  });

  test('a plugin with a newer version updates without a retry request', async () => {
    const found = await update({
      installs: [
        install(
          'formatter@m',
          { installed: '1.0.0', offered: '1.1.0' },
          { dependencyInstall: 'unfinished' },
        ),
      ],
    });
    expect('retry' in found).toBe(false);
  });

  test('--json carries failureCode and the plugin when the retry fails', async () => {
    const found = await update({ installs: [unfinished], args: { json: true } });
    if (!('retry' in found)) throw new Error('expected a retry');
    const out = shown(concludeRetry(found.retry, { ok: false, reason: 'boom' }), true);
    expect(JSON.parse(out.stdout.at(-1) ?? '')).toMatchObject({
      outcome: 'failed',
      failureCode: 'dependency_install_failed',
      pluginId: 'formatter@m',
    });
  });
});
