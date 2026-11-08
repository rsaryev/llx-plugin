/**
 * plugins/cli-reference.md § plugin uninstall (`--prune`: "Also remove auto-installed dependencies that
 * no remaining plugin needs"; `-y, --yes`: "Skip the `--prune` confirmation prompt. Required with
 * `--prune` when stdin or stdout isn't a TTY"). What a plugin that `--prune` removes keeps, the answers
 * to the prompt and the usage errors the docs do not quote are outside `spec(...)` and in
 * spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { concludeUninstall } from '../../src/cli/uninstall-plan.ts';
import { ID, lines, record, removing, start, world } from '../support/uninstall.ts';
import { spec } from '../support/spec.ts';

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
    expect(lines(done).stdout.join('\n')).not.toContain('auto-installed');
    expect(done.cleanup.map((one) => one.id)).toEqual([ID]);
  });

  test('an accepted confirmation removes the orphans and prints Removed N auto-installed plugins', () => {
    const begun = removing(start({ prune: true }, graph, true));
    expect(begun.prune.confirm).toBe('ask');
    const done = concludeUninstall(begun, {
      remaining: [record('mine@my-marketplace', 'project')],
      pruneConfirmed: true,
    });
    expect(done.removePruned).toEqual(['lib@my-marketplace']);
    expect(lines(done).stdout.join('\n')).toContain(
      'Removed 1 auto-installed plugins: lib@my-marketplace',
    );
  });

  test('a plugin --prune removes gets the same retention rules: its saved state and folder go', () => {
    const done = concludeUninstall(removing(start({ prune: true, yes: true }, graph)), {
      remaining: [record('mine@my-marketplace', 'project')],
    });
    expect(done.cleanup).toEqual([
      { id: ID, deleteSaved: true, deleteDataFolder: 'formatter-my-marketplace' },
      { id: 'lib@my-marketplace', deleteSaved: true, deleteDataFolder: 'lib-my-marketplace' },
    ]);
  });

  test('--keep-data keeps the folder of a pruned plugin too, and a pruned plugin installed at another scope keeps everything', () => {
    const kept = concludeUninstall(
      removing(start({ prune: true, yes: true, keepData: true }, graph)),
      { remaining: [] },
    );
    expect(kept.cleanup).toEqual([
      { id: ID, deleteSaved: true },
      { id: 'lib@my-marketplace', deleteSaved: true },
    ]);
    const elsewhere = concludeUninstall(removing(start({ prune: true, yes: true }, graph)), {
      remaining: [record('lib@my-marketplace', 'user')],
    });
    expect(elsewhere.cleanup.map((one) => one.id)).toEqual([ID]);
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
