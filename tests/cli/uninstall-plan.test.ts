/**
 * plugins/cli-reference.md § plugin uninstall (the flags and their defaults; `Successfully
 * uninstalled plugin: formatter (scope: project)`; the failure line `Failed to uninstall plugin
 * "formatter@my-marketplace":` for a plugin not installed at that scope; `"formatter" was not
 * uninstalled:` with `settings_still_on`; `--json` "in the same format as `plugin install --json`",
 * which "can't be combined with `--prune`"; `-y` "Skip the `--prune` confirmation prompt. Required
 * with `--prune` when stdin or stdout isn't a TTY"), "What an uninstall deletes and keeps" (`keptData`,
 * `savedKept`, `· data preserved`). The wording of the refusals the docs do not quote is outside
 * `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { renderCommand } from '../../src/cli/result.ts';
import { dataPreservedMark } from '../../src/cli/uninstall-plan.ts';
import {
  ID,
  conclude,
  lastJson,
  lines,
  record,
  removing,
  start,
  unscoped,
  world,
} from '../support/uninstall.ts';
import { spec } from '../support/spec.ts';

spec('cli.plugin.plugin uninstall.-s, --scope <scope>', () => {
  test('the scope the plugin is removed from is the flag value', () => {
    expect(removing(start({ scope: 'local' }, world([ID, { scope: 'local' }]))).scope).toBe(
      'local',
    );
  });

  test('without --scope it uninstalls from user', () => {
    const graph = world([ID, { scope: 'user' }]);
    expect(removing(unscoped(graph)).scope).toBe('user');
  });

  test('a plugin installed at project only is not uninstalled from the default user scope', () => {
    const found = unscoped(world([ID, { scope: 'project' }]));
    if (found.kind !== 'done') throw new Error('expected a refusal');
    const out = renderCommand(found.output, { json: false });
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toStartWith(`Failed to uninstall plugin "${ID}":`);
    expect(out.stderr[0]).toContain('is not installed at scope user');
  });

  test('a scope outside user, project and local is a usage error', () => {
    expect(start({ scope: 'managed' })).toMatchObject({
      kind: 'done',
      output: { kind: 'usage-error' },
    });
  });
});

describe('plugin uninstall: the command', () => {
  test('prints Successfully uninstalled plugin: <name> (scope: <scope>) and exits 0', () => {
    expect(lines(conclude({}))).toEqual({
      stdout: ['Successfully uninstalled plugin: formatter (scope: project)'],
      stderr: [],
      exitCode: 0,
    });
  });

  test('a plugin not installed at that scope fails with the Failed to uninstall plugin line, exit 1', () => {
    const found = start({}, world([ID, { scope: 'user' }]));
    if (found.kind !== 'done') throw new Error('expected a refusal');
    const out = renderCommand(found.output, { json: false });
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toStartWith(`Failed to uninstall plugin "${ID}":`);
  });

  test('remove and rm are aliases of the command, not of this plan: the name given may be bare', () => {
    expect(removing(start({ plugin: 'formatter' })).id).toBe(ID);
  });

  test('settings that still switch the plugin on keep the plugin installed with everything it saved', () => {
    const found = conclude({}, { remaining: [], settingsStillOn: '.claude/settings.json' });
    expect(found.removeRecord).toBe(false);
    expect(found.cleanup).toEqual([]);
    const out = lines(found);
    expect(out.exitCode).toBe(1);
    expect(out.stderr[0]).toStartWith(
      `Failed to uninstall plugin "${ID}": "formatter" was not uninstalled:`,
    );
    expect(out.stderr[0]).toContain('.claude/settings.json');
  });
});

spec('cli.plugin.plugin uninstall.--json', () => {
  test('prints the install result format with pluginId, scope and keptData', () => {
    expect(lastJson(conclude({ json: true }))).toEqual({
      command: 'uninstall',
      outcome: 'ok',
      pluginId: ID,
      scope: 'project',
      keptData: false,
      message: 'Successfully uninstalled plugin: formatter (scope: project)',
    });
  });

  test('settings_still_on is the failure code when the scope settings still switch it on', () => {
    const json = lastJson(
      conclude({ json: true }, { remaining: [], settingsStillOn: '.claude/settings.json' }),
    );
    expect(json).toMatchObject({
      outcome: 'failed',
      failureCode: 'settings_still_on',
      pluginId: ID,
    });
  });

  test('records that cannot be read back give savedKept and keptData true', () => {
    const json = lastJson(conclude({ json: true }, { remaining: 'unreadable' }));
    expect(json).toMatchObject({
      outcome: 'ok',
      savedKept: 'install_records_unreadable',
      keptData: true,
    });
  });

  test('keptData is false when the directory is deleted and carries no savedKept', () => {
    expect(lastJson(conclude({ json: true }))).not.toHaveProperty('savedKept');
  });

  test('is refused with --prune: a usage error with no result line', () => {
    const found = start({ json: true, prune: true, yes: true });
    expect(found).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });
});

spec('cli.plugin.plugin uninstall.--keep-data', () => {
  test('keeps the data directory and reports keptData', () => {
    const found = conclude({ keepData: true, json: true });
    expect(found.cleanup).toEqual([{ id: ID, deleteSaved: true }]);
    expect(lastJson(found)).toMatchObject({ keptData: true });
  });

  test('without it the last scope deletes the options, the secrets and the data directory', () => {
    expect(conclude({}).cleanup).toEqual([
      { id: ID, deleteSaved: true, deleteDataFolder: 'formatter-my-marketplace' },
    ]);
  });

  test('a plugin installed at another scope too keeps everything', () => {
    const found = conclude({}, { remaining: [record(ID, 'user')] });
    expect(found.cleanup).toEqual([]);
    expect(found.removeRecord).toBe(true);
  });
});

spec('cli.plugin.What an uninstall deletes and keeps', () => {
  test('--json reports keptData true when the directory stayed and /plugin marks it', () => {
    const found = conclude({ keepData: true, json: true });
    expect(lastJson(found)).toMatchObject({ keptData: true });
    expect(dataPreservedMark(true)).toBe('· data preserved');
    expect(dataPreservedMark(false)).toBe('');
  });

  test('the uninstall still succeeds when the records cannot be read back, and says what stayed and where the folder is', () => {
    const found = conclude({}, { remaining: 'unreadable' });
    const out = lines(found);
    expect(out.exitCode).toBe(0);
    expect(out.stdout.join('\n')).toContain('~/.claude/plugins/data/formatter-my-marketplace/');
    expect(found.cleanup).toEqual([]);
  });

  test('a directory kept because another plugin shares the folder is reported as kept', () => {
    const found = conclude({ json: true }, { remaining: [record('Formatter@My-Marketplace')] });
    expect(lastJson(found)).toMatchObject({ keptData: true });
    expect(found.cleanup).toEqual([{ id: ID, deleteSaved: true }]);
  });
});
