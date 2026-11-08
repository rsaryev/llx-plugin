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
import {
  concludeUninstall,
  dataPreservedMark,
  startUninstall,
  type AfterRemoval,
  type UninstallArguments,
  type UninstallStart,
} from '../../src/cli/uninstall-plan.ts';
import type { InstalledRecord } from '../../src/marketplace/dependency-graph.ts';
import { facts, installed } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const ID = 'formatter@my-marketplace';

const world = (...have: Parameters<typeof installed>[]) =>
  facts(
    [],
    have.map(([id, one]) => installed(id, one)),
  );

const unscoped = (graph = world([ID, { scope: 'user' }])): UninstallStart =>
  startUninstall({ plugin: ID }, { graph, tty: true });

const start = (
  args: Partial<UninstallArguments>,
  graph = world([ID, { scope: 'project' }]),
  tty = true,
): UninstallStart => startUninstall({ plugin: ID, scope: 'project', ...args }, { graph, tty });

const removing = (found: UninstallStart): Extract<UninstallStart, { kind: 'remove' }> => {
  if (found.kind !== 'remove') throw new Error(`expected a removal, got ${found.kind}`);
  return found;
};

const NOTHING_LEFT: AfterRemoval = { remaining: [] };

const conclude = (
  args: Partial<UninstallArguments>,
  after: AfterRemoval = NOTHING_LEFT,
  graph = world([ID, { scope: 'project' }]),
) => concludeUninstall(removing(start(args, graph)), after);

const record = (id: string, scope: InstalledRecord['scope'] = 'user'): InstalledRecord => ({
  id,
  scope,
  dependencies: [],
});

const lines = (found: ReturnType<typeof conclude>, json = false) =>
  renderCommand(found.output, { json });

const lastJson = (found: ReturnType<typeof conclude>): Record<string, unknown> => {
  const out = renderCommand(found.output, { json: true }).stdout;
  return JSON.parse(out.at(-1) ?? '{}');
};

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
    expect(found).toMatchObject({ kind: 'done' });
    expect(JSON.stringify(found)).toContain('is not installed');
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

spec('cli.plugin.plugin uninstall.--prune', () => {
  const graph = world(
    [ID, { scope: 'project', deps: ['lib'] }],
    ['lib@my-marketplace', { scope: 'project', auto: true }],
    ['mine@my-marketplace', { scope: 'project' }],
  );

  test('also removes the auto-installed dependencies no remaining plugin needs', () => {
    const begun = removing(start({ prune: true, yes: true }, graph));
    expect(begun.prune).toEqual({ orphans: ['lib@my-marketplace'], confirm: 'skip' });
    const done = concludeUninstall(begun, {
      remaining: [record('mine@my-marketplace', 'project')],
    });
    expect(done.removePruned).toEqual(['lib@my-marketplace']);
    expect(lines(done).stdout.join('\n')).toContain(
      'Removed 1 auto-installed plugins: lib@my-marketplace',
    );
  });

  test('a dependency another remaining plugin still needs stays', () => {
    const shared = world(
      [ID, { scope: 'project', deps: ['lib'] }],
      ['lib@my-marketplace', { scope: 'project', auto: true }],
      ['other@my-marketplace', { scope: 'project', deps: ['lib'] }],
    );
    expect(removing(start({ prune: true, yes: true }, shared)).prune.orphans).toEqual([]);
  });

  test('without a terminal and without -y the uninstall is refused before anything is removed', () => {
    const found = start({ prune: true }, graph, false);
    expect(found).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });

  test('with a terminal and without -y the host is told to ask before it removes them', () => {
    expect(removing(start({ prune: true }, graph, true)).prune.confirm).toBe('ask');
  });

  test('a declined confirmation uninstalls the plugin and prunes nothing', () => {
    const begun = removing(start({ prune: true }, graph, true));
    const done = concludeUninstall(begun, { remaining: [], pruneConfirmed: false });
    expect(done.removePruned).toEqual([]);
    expect(lines(done).exitCode).toBe(0);
  });
});

spec('cli.plugin.plugin uninstall.-y, --yes', () => {
  const graph = world(
    [ID, { scope: 'project', deps: ['lib'] }],
    ['lib@my-marketplace', { scope: 'project', auto: true }],
  );

  test('skips the --prune confirmation prompt', () => {
    expect(removing(start({ prune: true, yes: true }, graph, true)).prune.confirm).toBe('skip');
  });

  test('is what lets --prune run when stdin or stdout is not a terminal', () => {
    expect(removing(start({ prune: true, yes: true }, graph, false)).kind).toBe('remove');
  });
});

describe('--prune confirmation with nothing to prune', () => {
  test('asks for nothing when no dependency is orphaned', () => {
    const only = world([ID, { scope: 'project' }]);
    expect(removing(start({ prune: true }, only, true)).prune.confirm).toBe('none');
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
