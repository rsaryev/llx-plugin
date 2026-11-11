/**
 * plugins/cli-reference.md § plugin prune ("Remove auto-installed dependencies that no installed
 * plugin needs anymore. The command never removes a plugin you installed yourself"; the three
 * outputs) and § plugin uninstall (`--prune`), plugins/install.md § Plugins with dependencies
 * (Uninstall: "auto-installed dependencies stay until you run `claude plugin prune`"), plugins/
 * dependencies.md § Combine constraints from several plugins (the last constraining plugin leaves:
 * the range is released). The `plugin prune` and `--prune` ids are proven by tests/cli; the pure
 * decisions here are outside `spec(...)` but for the install.md Uninstall rule.
 */
import { describe, expect, test } from 'bun:test';
import {
  orphanedAutoInstalled,
  planPrune,
  planUninstall,
} from '../../src/marketplace/dependency-prune.ts';
import { facts, installed } from '../support/dependency-facts.ts';
import { spec } from '../support/spec.ts';

const chain = facts(
  [],
  [
    installed('app@m', { deps: ['lib'] }),
    installed('lib@m', { auto: true, deps: ['core'] }),
    installed('core@m', { auto: true }),
    installed('stray@m', { auto: true }),
  ],
);

describe('orphanedAutoInstalled', () => {
  test('keeps what an installed plugin needs, directly or through other dependencies; removes the rest', () => {
    expect(orphanedAutoInstalled(chain, 'user')).toEqual(['stray@m']);
  });

  test('never removes a plugin the user installed themselves, though nothing needs it', () => {
    const have = facts([], [installed('mine@m'), installed('also-mine@m', { auto: false })]);
    expect(orphanedAutoInstalled(have, 'user')).toEqual([]);
  });

  test('a dependency another remaining plugin still needs stays', () => {
    const have = facts(
      [],
      [
        installed('a@m', { deps: ['shared'] }),
        installed('b@m', { deps: ['shared'] }),
        installed('shared@m', { auto: true }),
      ],
    );
    expect(orphanedAutoInstalled(have, 'user')).toEqual([]);
  });

  test('transitive orphans go too: a dependency only an orphan needs', () => {
    const have = facts(
      [],
      [installed('lib@m', { auto: true, deps: ['core'] }), installed('core@m', { auto: true })],
    );
    expect(orphanedAutoInstalled(have, 'user')).toEqual(['lib@m', 'core@m']);
  });

  test('auto-installed plugins that only need each other are orphans', () => {
    const have = facts(
      [],
      [
        installed('a@m', { auto: true, deps: ['b'] }),
        installed('b@m', { auto: true, deps: ['a'] }),
      ],
    );
    expect(orphanedAutoInstalled(have, 'user')).toEqual(['a@m', 'b@m']);
  });

  test('looks at one scope: a plugin installed at another scope neither needs nor is pruned', () => {
    const have = facts(
      [],
      [
        installed('app@m', { scope: 'project', deps: ['lib'] }),
        installed('lib@m', { scope: 'user', auto: true }),
      ],
    );
    expect(orphanedAutoInstalled(have, 'user')).toEqual(['lib@m']);
    expect(orphanedAutoInstalled(have, 'project')).toEqual([]);
  });

  test('a disabled user-installed plugin still needs its dependencies', () => {
    const have = facts(
      [],
      [installed('app@m', { deps: ['lib'], enabled: false }), installed('lib@m', { auto: true })],
    );
    expect(orphanedAutoInstalled(have, 'user')).toEqual([]);
  });
});

describe('planPrune (cli-reference.md, plugin prune)', () => {
  const run = (flags: Parameters<typeof planPrune>[2], have = chain) =>
    planPrune(have, 'user', flags);

  test('with none to remove it prints a line that starts `Nothing to prune`', () => {
    const outcome = planPrune(facts(), 'user', { tty: true });
    expect(outcome.kind).toBe('nothing');
    expect(outcome.kind === 'nothing' && outcome.message.startsWith('Nothing to prune')).toBe(true);
  });

  test('--dry-run lists the orphans and ends with `(dry run — nothing removed)`, even with -y', () => {
    for (const flags of [
      { dryRun: true, tty: true },
      { dryRun: true, yes: true, tty: false },
    ]) {
      const outcome = run(flags);
      expect(outcome.kind).toBe('listed');
      expect(outcome.kind === 'listed' && outcome.message).toBe(
        'stray@m\n(dry run — nothing removed)',
      );
    }
  });

  test('-y on any terminal removes them and prints `Removed N auto-installed plugins: <names>`', () => {
    for (const tty of [true, false]) {
      const outcome = run({ yes: true, tty });
      expect(outcome).toMatchObject({ kind: 'removed', orphans: ['stray@m'] });
      expect(outcome.kind === 'removed' && outcome.message).toBe(
        'Removed 1 auto-installed plugins: stray@m',
      );
    }
  });

  test('an interactive terminal without -y asks `Remove? [y/N]`', () => {
    expect(run({ tty: true })).toMatchObject({ kind: 'ask', prompt: 'Remove? [y/N]' });
  });

  test('a pipe without -y lists them, says to run -y, and removes nothing', () => {
    const outcome = run({ tty: false });
    expect(outcome.kind).toBe('refused');
    expect(outcome.kind === 'refused' && outcome.message).toBe(
      'stray@m\nNot a TTY — run `claude plugin prune -y` to remove.',
    );
  });
});

spec('install.guide.Plugins with dependencies.Uninstall', () => {
  test('auto-installed dependencies stay after the uninstall, and prune removes them once nothing needs them', () => {
    expect(planUninstall('app@m', 'user', chain, false)).toMatchObject({
      remove: 'app@m',
      pruned: [],
    });
    const after = facts(
      [],
      [installed('lib@m', { auto: true, deps: ['core'] }), installed('core@m', { auto: true })],
    );
    expect(orphanedAutoInstalled(after, 'user')).toEqual(['lib@m', 'core@m']);
  });
});

describe('planUninstall (cli-reference.md, plugin uninstall --prune)', () => {
  test('with --prune the dependencies no remaining plugin needs go with it, transitive ones included', () => {
    expect(planUninstall('app@m', 'user', chain, true).pruned).toEqual([
      'lib@m',
      'core@m',
      'stray@m',
    ]);
  });

  test('with --prune a dependency another plugin still needs stays', () => {
    const have = facts(
      [],
      [
        installed('a@m', { deps: ['shared'] }),
        installed('b@m', { deps: ['shared'] }),
        installed('shared@m', { auto: true }),
      ],
    );
    expect(planUninstall('a@m', 'user', have, true).pruned).toEqual([]);
  });

  test('a plugin the user installed is never pruned', () => {
    const have = facts([], [installed('app@m', { deps: ['lib'] }), installed('lib@m')]);
    expect(planUninstall('app@m', 'user', have, true).pruned).toEqual([]);
  });

  test('uninstalling the last plugin that constrains a dependency releases its range', () => {
    const have = facts(
      [],
      [
        installed('a@m', { deps: [{ name: 'lib', version: '^2.0' }] }),
        installed('b@m', { deps: [{ name: 'lib', version: '>=2.1' }] }),
        installed('lib@m', { auto: true, version: '2.5.0' }),
      ],
    );
    expect(planUninstall('a@m', 'user', have, false).released).toEqual([]);
    const last = facts(
      [],
      [
        installed('b@m', { deps: [{ name: 'lib', version: '>=2.1' }] }),
        installed('lib@m', { auto: true, version: '2.5.0' }),
      ],
    );
    expect(planUninstall('b@m', 'user', last, false).released).toEqual(['lib@m']);
  });

  test('a plugin installed at another scope still constrains, so nothing is released', () => {
    const have = facts(
      [],
      [
        installed('b@m', { scope: 'user', deps: [{ name: 'lib', version: '~2.1' }] }),
        installed('b@m', { scope: 'project', deps: [{ name: 'lib', version: '~2.1' }] }),
        installed('lib@m', { auto: true }),
      ],
    );
    expect(planUninstall('b@m', 'user', have, false).released).toEqual([]);
  });

  test('a dependency with no range from the uninstalled plugin is not released', () => {
    const have = facts(
      [],
      [installed('b@m', { deps: ['lib'] }), installed('lib@m', { auto: true })],
    );
    expect(planUninstall('b@m', 'user', have, false).released).toEqual([]);
  });
});
