/**
 * An install plan over a catalog whose plugins' `plugin.json` is not read yet. plugins/
 * marketplace-reference.md § Display fields ("Before install, Claude Code can read `plugin.json`
 * only for entries with a relative-path source ... For an entry with any other source type, users
 * see only the entry's own fields until they install the plugin"), § Plugin entries (`dependencies`
 * on the entry) and plugins/dependencies.md § Declare a dependency with a version constraint
 * (`dependencies` in `plugin.json`): a remote plugin's own dependencies are known only once it is
 * fetched. How Claude Code orders those fetches the docs do not say: judgment `installNeeds`
 * (spec/judgments.md), so no `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { catalogDependencies } from '../../src/marketplace/dependency-catalog.ts';
import type { CatalogPlugin, GraphFacts } from '../../src/marketplace/dependency-graph.ts';
import { installClosure, type InstallPlan } from '../../src/marketplace/dependency-install-plan.ts';
import { facts, installed, plugin } from '../support/dependency-facts.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';

const request = { root: 'app@m', scope: 'user', operation: 'install' } as const;

/** The catalog as a host sees it before any fetch: every plugin.json unread, the entry's dependencies only. */
function unread(full: GraphFacts): GraphFacts {
  const catalog = Object.fromEntries(
    Object.entries(full.catalog).map(([id, entry]): [string, CatalogPlugin] => [
      id,
      {
        ...entry,
        dependencies: entry.dependencies.filter((one) => one.declaredIn === 'entry'),
        manifestUnread: true,
      },
    ]),
  );
  return { ...full, catalog };
}

/** The host's loop: fetch what the plan needs, read it, plan again, until nothing is needed. */
function settle(full: GraphFacts): { readonly plan: InstallPlan; readonly rounds: number } {
  let known = unread(full);
  for (let rounds = 1; ; rounds += 1) {
    const plan = installClosure(request, known);
    if (plan.needs.length === 0) return { plan, rounds };
    const catalog = { ...known.catalog };
    for (const id of plan.needs) {
      const fetched = full.catalog[id];
      if (fetched !== undefined) catalog[id] = fetched;
    }
    known = { ...known, catalog };
  }
}

const GRAPHS: Readonly<Record<string, GraphFacts>> = {
  chain: facts([
    plugin('app', { manifest: ['lib'] }),
    plugin('lib', { manifest: ['core'] }),
    plugin('core', { entry: ['base'] }),
    plugin('base'),
  ]),
  cycle: facts([
    plugin('app', { manifest: ['a'] }),
    plugin('a', { manifest: ['b'] }),
    plugin('b', { manifest: ['a', 'app'] }),
  ]),
  diamond: facts([
    plugin('app', { manifest: ['left', 'right'] }),
    plugin('left', { manifest: [{ name: 'shared', version: '^2.0' }] }),
    plugin('right', { manifest: [{ name: 'shared', version: '>=2.1' }] }),
    plugin('shared', { tags: ['shared--v2.0.0', 'shared--v2.4.0', 'shared--v3.0.0'] }),
  ]),
  conflict: facts([
    plugin('app', { manifest: ['left', 'right'] }),
    plugin('left', { manifest: [{ name: 'shared', version: '~2.1' }] }),
    plugin('right', { manifest: [{ name: 'shared', version: '~3.0' }] }),
    plugin('shared', { tags: ['shared--v2.1.0', 'shared--v3.0.0'] }),
  ]),
  missing: facts([plugin('app', { entry: ['lib'] }), plugin('lib', { manifest: ['gone'] })]),
  'installed and met': facts(
    [plugin('app', { manifest: ['lib'] }), plugin('lib', { manifest: ['core'] }), plugin('core')],
    [installed('lib@m')],
  ),
  'other marketplace': facts([
    plugin('app', { manifest: [{ name: 'tool', marketplace: 'other' }] }),
    plugin('tool', { marketplace: 'other' }),
  ]),
};

describe('a plan over plugins not fetched yet', () => {
  test('an unread root is needed first: its plugin.json may declare more', () => {
    const plan = installClosure(request, unread(GRAPHS.chain ?? facts()));
    expect(plan.needs).toEqual(['app@m']);
    expect(plan.ok).toBe(false);
    expect(plan.issues).toEqual([]);
  });

  test('what the entries declare is planned at once, and each plugin it reaches is needed', () => {
    const plan = installClosure(request, unread(GRAPHS.missing ?? facts()));
    expect(plan.needs).toEqual(['app@m', 'lib@m']);
    expect(plan.steps.map((step) => step.id)).toEqual(['lib@m']);
  });

  test('a plugin whose plugin.json is read is not needed again', () => {
    const plan = installClosure(request, GRAPHS.chain ?? facts());
    expect(plan.needs).toEqual([]);
    expect(plan.ok).toBe(true);
  });

  for (const [name, full] of Object.entries(GRAPHS)) {
    test(`fetching what each plan needs settles on the plan of the whole catalog: ${name}`, () => {
      const { plan, rounds } = settle(full);
      expect(plan).toEqual(installClosure(request, full));
      expect(rounds).toBeLessThanOrEqual(Object.keys(full.catalog).length + 1);
    });
  }

  test('a plugin the walk never reaches is never needed', () => {
    const full = facts([plugin('app'), plugin('elsewhere', { manifest: ['x'] })]);
    expect(installClosure(request, unread(full)).needs).toEqual(['app@m']);
  });
});

describe('catalogDependencies', () => {
  const entryOf = (changes: Record<string, unknown>) => loaded(rawEntry(changes));

  test("plugin.json's dependencies, then the entry's, each with where it was declared", () => {
    const entry = entryOf({
      name: 'app',
      dependencies: ['tool@other'],
    });
    expect(
      catalogDependencies(entry, 'm', {
        name: 'app',
        dependencies: [{ name: 'lib', version: '^1' }],
      }),
    ).toEqual({
      dependencies: [
        { dep: { name: 'lib', marketplace: 'm', range: '^1' }, declaredIn: 'plugin.json' },
        {
          dep: { name: 'tool', marketplace: 'other' },
          declaredIn: 'entry',
          namesMarketplace: true,
        },
      ],
      issues: [],
    });
  });

  test('without plugin.json the entry is the manifest: its dependencies only', () => {
    const entry = entryOf({ name: 'app', source: './app', dependencies: ['lib'] });
    expect(catalogDependencies(entry, 'm', undefined).dependencies).toEqual([
      { dep: { name: 'lib', marketplace: 'm' }, declaredIn: 'entry' },
    ]);
  });

  test('an item that does not read is an issue at its place, and the others still count', () => {
    const entry = entryOf({ name: 'app', source: './app' });
    const found = catalogDependencies(entry, 'm', {
      name: 'app',
      dependencies: [{ name: 'lib', version: 'not a range' }, 'core'],
    });
    expect(found.dependencies.map((one) => one.dep.name)).toEqual(['core']);
    expect(found.issues.map((issue) => issue.path)).toEqual(['dependencies[0].version']);
  });
});
