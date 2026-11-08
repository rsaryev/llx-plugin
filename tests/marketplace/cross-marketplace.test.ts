/**
 * plugins/dependencies.md § Depend on a plugin from another marketplace (a dependency from another
 * marketplace than the declaring plugin's installs only when the root marketplace, the one hosting
 * the plugin the user installs, lists it in `allowCrossMarketplaceDependenciesOn`; only the root
 * marketplace's list applies; a dependency already enabled at the same scope bypasses the check; a
 * refusal in a marketplace entry refuses the install with a quoted message, one in `plugin.json`
 * installs without the dependency); plugins/marketplace-reference.md § Top-level fields (the field
 * is an array of marketplace names, and the root's list applies to the whole chain);
 * plugins/host-marketplace.md § Depend on and recommend other plugins; plugins/troubleshooting.md
 * § Dependency errors. What the docs leave open is outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { readMarketplace } from '../../src/format/marketplace/marketplace.ts';
import type { Marketplace } from '../../src/format/marketplace/types.ts';
import { crossMarketplaceDecision } from '../../src/marketplace/cross-marketplace.ts';
import { normalizeDependency } from '../../src/marketplace/dependencies.ts';
import { spec } from '../support/spec.ts';

const ROOT = 'your-marketplace';
const SHARED = 'your-shared-marketplace';

const marketplace = (allow?: readonly string[], name = ROOT): Marketplace => ({
  name,
  owner: { name: 'Your Org' },
  plugins: [],
  forceRemoveDeletedPlugins: false,
  allowCrossMarketplaceDependenciesOn: allow ?? [],
  renames: {},
});

const dependency = (
  declaring: string,
  value: unknown = { name: 'audit-logger', marketplace: SHARED },
) => {
  const dep = normalizeDependency(value, declaring);
  if ('severity' in dep) throw new Error(dep.message);
  return dep;
};

const decide = (
  allow: readonly string[] | undefined,
  declaredIn: 'entry' | 'plugin.json',
  enabled: readonly string[] = [],
) =>
  crossMarketplaceDecision({
    dep: dependency(ROOT),
    requiredBy: { name: 'deploy-kit', marketplace: ROOT },
    root: marketplace(allow),
    enabledAtScope: new Set(enabled),
    declaredIn,
  });

const REFUSAL =
  'Dependency "audit-logger@your-shared-marketplace" (required by deploy-kit@your-marketplace) is in marketplace "your-shared-marketplace", which is not in the allowlist';

spec('marketplace.field.allowCrossMarketplaceDependenciesOn', () => {
  test('the marketplace.json example allows deploy-kit to depend on a plugin from your-shared-marketplace', () => {
    const { marketplace: read } = readMarketplace({
      name: ROOT,
      owner: { name: 'Your Org' },
      allowCrossMarketplaceDependenciesOn: [SHARED],
      plugins: [
        {
          name: 'deploy-kit',
          source: './deploy-kit',
          dependencies: [{ name: 'audit-logger', marketplace: SHARED }],
        },
      ],
    });
    expect(read?.allowCrossMarketplaceDependenciesOn).toEqual([SHARED]);
    const dep = dependency(ROOT);
    if (read === undefined) throw new Error('the marketplace.json example must read');
    expect(
      crossMarketplaceDecision({
        dep,
        requiredBy: { name: 'deploy-kit', marketplace: ROOT },
        root: read,
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      }),
    ).toEqual({ allowed: true });
  });

  test('a marketplace that lists the target allows it; the same dependency is refused when the field is missing', () => {
    expect(decide([SHARED], 'entry')).toEqual({ allowed: true });
    expect(decide(undefined, 'entry')).toMatchObject({ allowed: false });
  });

  test('a list that does not include the target marketplace does not allow it', () => {
    expect(decide(['some-other-marketplace'], 'entry')).toMatchObject({ allowed: false });
    expect(decide([], 'entry')).toMatchObject({ allowed: false });
  });

  test('the target is matched by name exactly, not by prefix or letter case', () => {
    expect(decide(['your-shared'], 'entry')).toMatchObject({ allowed: false });
    expect(decide(['Your-Shared-Marketplace'], 'entry')).toMatchObject({ allowed: false });
  });

  test('declared in the marketplace entry, the install is refused with the quoted message, naming the field to set', () => {
    const found = decide(undefined, 'entry');
    expect(found).toMatchObject({ allowed: false, effect: 'refuse-install' });
    const message = found.allowed ? '' : found.message;
    expect(message.startsWith(REFUSAL)).toBe(true);
    expect(message).toContain('allowCrossMarketplaceDependenciesOn');
  });

  test('declared in plugin.json, the install completes without the dependency (the plugin then fails to load)', () => {
    const found = decide(undefined, 'plugin.json');
    expect(found).toMatchObject({ allowed: false, effect: 'install-without-dependency' });
    expect(found.allowed ? '' : found.message.startsWith(REFUSAL)).toBe(true);
  });

  test('a dependency already enabled at the same scope bypasses the allowlist', () => {
    expect(decide(undefined, 'entry', ['audit-logger@your-shared-marketplace'])).toEqual({
      allowed: true,
    });
    expect(decide(undefined, 'plugin.json', ['audit-logger@your-shared-marketplace'])).toEqual({
      allowed: true,
    });
  });

  test('a different plugin enabled at the scope does not bypass it', () => {
    expect(
      decide(undefined, 'entry', [
        'audit-logger@your-marketplace',
        'other@your-shared-marketplace',
      ]),
    ).toMatchObject({
      allowed: false,
    });
  });

  test('a dependency in the declaring plugin marketplace is never cross-marketplace', () => {
    const dep = dependency(ROOT, 'audit-logger');
    expect(
      crossMarketplaceDecision({
        dep,
        requiredBy: { name: 'deploy-kit', marketplace: ROOT },
        root: marketplace(),
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      }),
    ).toEqual({ allowed: true });
  });

  test('only the root marketplace list applies, for the whole dependency chain', () => {
    // The user installs deploy-kit from ROOT, which allows SHARED. audit-logger (in SHARED) depends on
    // a plugin of a third marketplace, and SHARED's own list allows it: only ROOT's list counts.
    const sharedPlugin = { name: 'audit-logger', marketplace: SHARED };
    const dep = dependency(SHARED, { name: 'log-sink', marketplace: 'third-party' });
    const decision = (rootAllows: readonly string[], sharedAllows: readonly string[]) =>
      crossMarketplaceDecision({
        dep,
        requiredBy: sharedPlugin,
        root: marketplace(rootAllows),
        declaringMarketplace: marketplace(sharedAllows, SHARED),
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      });
    expect(decision([SHARED], ['third-party'])).toMatchObject({ allowed: false });
    expect(decision(['third-party'], [])).toEqual({ allowed: true });
    const refused = decision([SHARED], ['third-party']);
    expect(refused.allowed ? '' : refused.message).toContain(
      '(required by audit-logger@your-shared-marketplace)',
    );
  });
});

spec('dependencies.field.marketplace', () => {
  test('a `marketplace` other than the declaring plugin marketplace is a cross-marketplace dependency; without it, never', () => {
    const named = dependency(ROOT, { name: 'audit-logger', marketplace: SHARED });
    const bare = dependency(ROOT, { name: 'audit-logger' });
    const asked = (dep: typeof named) =>
      crossMarketplaceDecision({
        dep,
        requiredBy: { name: 'deploy-kit', marketplace: ROOT },
        root: marketplace(),
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      });
    expect(asked(named)).toMatchObject({ allowed: false });
    expect(asked(bare)).toEqual({ allowed: true });
  });
});

describe('judgments (outside spec)', () => {
  test('a dependency that names the root marketplace itself is allowed, without being on its own list', () => {
    const dep = dependency('elsewhere', { name: 'audit-logger', marketplace: ROOT });
    expect(
      crossMarketplaceDecision({
        dep,
        requiredBy: { name: 'x', marketplace: 'elsewhere' },
        root: marketplace(),
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      }),
    ).toEqual({ allowed: true });
  });

  test('a dependency with no marketplace (declared by a plugin that has none) is not cross-marketplace', () => {
    const bare = { name: 'audit-logger' };
    expect(
      crossMarketplaceDecision({
        dep: bare,
        requiredBy: { name: 'x' },
        root: marketplace(),
        enabledAtScope: new Set(),
        declaredIn: 'entry',
      }),
    ).toEqual({ allowed: true });
  });

  test('the refusal reads "required by <plugin>" with no marketplace for a plugin that has none', () => {
    const found = crossMarketplaceDecision({
      dep: dependency(ROOT),
      requiredBy: { name: 'synced-plugin' },
      root: marketplace(),
      enabledAtScope: new Set(),
      declaredIn: 'entry',
    });
    expect(found.allowed ? '' : found.message).toContain('(required by synced-plugin)');
  });
});
