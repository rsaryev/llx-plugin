/**
 * Integration of the marketplace stream through the public barrel (docs/API.md, "Marketplace"):
 * `readMarketplace` as shipped reads the entries with the entry reader over the plugin source
 * parser, and what it returns feeds the planners and decisions (fetch plan, renames, dependencies,
 * cross-marketplace allowlist). The behaviour of each piece is proven under `spec(...)` in its own
 * file against plugins/marketplace-reference.md, plugins/host-marketplace.md and
 * plugins/dependencies.md; this file proves only that the pieces are wired, so it is outside
 * `spec(...)` and never counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import {
  crossMarketplaceDecision,
  normalizeDependency,
  planPluginFetch,
  readMarketplace,
  resolveRename,
  validateMarketplace,
  type MarketplaceEntry,
} from '../../../src/entry/marketplace.ts';
import { docMarketplace, withFields } from '../../support/marketplace-fixtures.ts';

const SHA = 'a'.repeat(40);

/** One entry of every plugin source type of "Plugin sources", a bare name under `pluginRoot`, and a dependency. */
const fullMarketplace = (): Record<string, unknown> => ({
  name: 'your-marketplace',
  description: 'Plugins for the team',
  owner: { name: 'Your Org' },
  metadata: { pluginRoot: './plugins' },
  allowCrossMarketplaceDependenciesOn: ['your-shared-marketplace'],
  renames: { formatter: 'code-formatter', 'legacy-linter': null },
  plugins: [
    { name: 'code-formatter', source: './plugins/code-formatter' },
    { name: 'bare-plugin', source: 'bare-plugin' },
    { name: 'from-github', source: { source: 'github', repo: 'your-org/formatter', sha: SHA } },
    { name: 'from-url', source: { source: 'url', url: 'https://git.example.com/p.git' } },
    {
      name: 'from-subdir',
      source: { source: 'git-subdir', url: 'your-org/mono', path: 'tools/p', ref: 'v1' },
    },
    { name: 'from-npm', source: { source: 'npm', package: '@acme/plugin', version: '^1.0.0' } },
    {
      name: 'from-archive',
      source: { source: 'archive', url: 'https://example.com/p.zip', sha256: 'b'.repeat(64) },
    },
    { name: 'from-command', source: { source: 'command', command: 'print-plugin-dir' } },
    {
      name: 'deploy-kit',
      source: './plugins/deploy-kit',
      dependencies: [
        'code-formatter',
        { name: 'audit-logger', marketplace: 'your-shared-marketplace', version: '~2.1.0' },
      ],
    },
  ],
});

const read = (raw: unknown) => readMarketplace(raw, {});

describe('readMarketplace as shipped', () => {
  test('reads the documented example file with its entry, without an issue', () => {
    const { marketplace, issues } = read(docMarketplace());
    expect(issues).toEqual([]);
    expect(marketplace?.plugins.map((entry) => entry.name)).toEqual(['my-first-plugin']);
    expect(marketplace?.plugins[0]?.source).toEqual({
      kind: 'relative',
      path: 'plugins/my-first-plugin',
      bare: false,
    });
  });

  test('keeps an entry of every source type and the kind each one parsed to', () => {
    const { marketplace, issues } = read(fullMarketplace());
    expect(issues).toEqual([]);
    expect(marketplace?.plugins.map((entry) => entry.source.kind)).toEqual([
      'relative',
      'relative',
      'github',
      'url',
      'git-subdir',
      'npm',
      'archive',
      'command',
      'relative',
    ]);
    expect(marketplace?.plugins[1]?.source).toEqual({
      kind: 'relative',
      path: 'plugins/bare-plugin',
      bare: true,
    });
  });

  test('validate reports nothing for the same file', () => {
    expect(validateMarketplace(fullMarketplace())).toEqual([]);
  });

  test('drops an invalid entry alone, with the source error on its own path', () => {
    const raw = withFields({
      plugins: [
        { name: 'good', source: './plugins/good' },
        { name: 'bad', source: 'not-relative/path' },
      ],
    });
    const { marketplace, issues } = read(raw);
    expect(marketplace?.plugins.map((entry) => entry.name)).toEqual(['good']);
    expect(issues).toContainEqual({
      severity: 'error',
      path: 'plugins[1].source',
      message: 'Invalid string: must start with "./"',
    });
  });
});

const loadedMarketplace = () => {
  const { marketplace } = read(fullMarketplace());
  if (marketplace === undefined) throw new Error('the marketplace did not load');
  return marketplace;
};

describe('what a read marketplace feeds', () => {
  const marketplace = loadedMarketplace;
  const entry = (name: string): MarketplaceEntry => {
    const found = marketplace().plugins.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`no entry ${name}`);
    return found;
  };

  test('every entry source plans a fetch', () => {
    for (const { name, source } of marketplace().plugins) {
      const { plan, issues } = planPluginFetch(source, { platform: 'posix' });
      expect({ name, issues }).toEqual({ name, issues: [] });
      expect(plan).toBeDefined();
    }
    expect(planPluginFetch(entry('from-github').source, { platform: 'posix' }).plan).toMatchObject({
      kind: 'git',
      checkout: 'sha',
    });
    expect(planPluginFetch(entry('from-npm').source, { platform: 'posix' }).plan).toMatchObject({
      kind: 'npm',
      runInstallScripts: false,
    });
  });

  test('the renames map resolves old names against the read plugins', () => {
    const loaded = marketplace();
    expect(resolveRename('formatter', loaded)).toEqual({ status: 'renamed', to: 'code-formatter' });
    expect(resolveRename('legacy-linter', loaded)).toEqual({ status: 'removed' });
    expect(resolveRename('code-formatter', loaded)).toEqual({ status: 'current' });
  });

  test('an entry dependency normalizes and the root allowlist decides the cross-marketplace one', () => {
    const loaded = marketplace();
    const items = entry('deploy-kit').dependencies ?? [];
    const deps = items.map((item) => normalizeDependency(item, loaded.name));
    expect(deps).toEqual([
      { name: 'code-formatter', marketplace: 'your-marketplace' },
      { name: 'audit-logger', marketplace: 'your-shared-marketplace', range: '~2.1.0' },
    ]);
    const cross = deps[1];
    if (cross === undefined || 'severity' in cross) throw new Error('not a dependency');
    const ask = (root: typeof loaded) =>
      crossMarketplaceDecision({
        dep: cross,
        requiredBy: { name: 'deploy-kit', marketplace: loaded.name },
        root,
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      });
    expect(ask(loaded)).toEqual({ allowed: true });
    expect(ask({ ...loaded, allowCrossMarketplaceDependenciesOn: [] })).toMatchObject({
      allowed: false,
      effect: 'refuse-install',
    });
  });
});
