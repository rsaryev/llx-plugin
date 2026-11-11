/**
 * Builders of the plain facts the dependency graph reads (`GraphFacts`): a catalog of plugins, what
 * is installed and what each scope enables. A test writes the plugins it needs in a line each.
 */
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { namesMarketplace, normalizeDependency } from '../../src/marketplace/dependencies.ts';
import type {
  CatalogPlugin,
  DeclaredDependency,
  GraphFacts,
  InstalledRecord,
} from '../../src/marketplace/dependency-graph.ts';
import type { InstallScope } from '../../src/marketplace/install-scopes.ts';
import type { NormalizedDependency } from '../../src/marketplace/types.ts';

/** A dependency item as `plugin.json` writes it, normalized for a plugin of `marketplace`. */
export function dep(value: unknown, marketplace = 'm'): NormalizedDependency {
  const found = normalizeDependency(value, marketplace);
  if ('severity' in found) throw new Error(found.message);
  return found;
}

const githubSource = (repo: string): PluginSource => ({ kind: 'github', repo });
export const relativeSource = (path: string): PluginSource => ({
  kind: 'relative',
  path,
  bare: false,
});

export interface Spec {
  readonly marketplace?: string;
  readonly source?: PluginSource;
  /** Dependency items in the plugin's entry. */
  readonly entry?: readonly unknown[];
  /** Dependency items in its `plugin.json`. */
  readonly manifest?: readonly unknown[];
  readonly tags?: readonly string[];
  readonly tagCommits?: Readonly<Record<string, string>>;
  readonly currentCopyVersion?: string;
  readonly headersHelper?: string;
  readonly defaultEnabled?: boolean;
}

/** `[id, plugin]` of a catalog: dependencies in the entry or in `plugin.json` normalize to the plugin's marketplace. */
export function plugin(name: string, spec: Spec = {}): readonly [string, CatalogPlugin] {
  const marketplace = spec.marketplace ?? 'm';
  const declared = (items: readonly unknown[] = [], declaredIn: DeclaredDependency['declaredIn']) =>
    items.map((item) => ({
      dep: dep(item, marketplace),
      declaredIn,
      ...(namesMarketplace(item) ? { namesMarketplace: true } : {}),
    }));
  return [
    `${name}@${marketplace}`,
    {
      name,
      marketplace,
      source: spec.source ?? githubSource(`acme/${name}`),
      dependencies: [...declared(spec.entry, 'entry'), ...declared(spec.manifest, 'plugin.json')],
      ...(spec.tags === undefined ? {} : { tags: spec.tags }),
      ...(spec.tagCommits === undefined ? {} : { tagCommits: spec.tagCommits }),
      ...(spec.currentCopyVersion === undefined
        ? {}
        : { currentCopyVersion: spec.currentCopyVersion }),
      ...(spec.headersHelper === undefined ? {} : { headersHelper: spec.headersHelper }),
      ...(spec.defaultEnabled === undefined ? {} : { defaultEnabled: spec.defaultEnabled }),
    },
  ];
}

export interface InstalledSpec {
  readonly scope?: InstallScope;
  readonly auto?: boolean;
  readonly version?: string;
  readonly deps?: readonly unknown[];
  /** The value `enabledPlugins` has for it at `scope`; true when absent, `null` for none. */
  readonly enabled?: boolean | null;
  /** The merged `defaultEnabled` of the plugin. */
  readonly defaultEnabled?: boolean;
}

/** An installed plugin as `[record, enabled value]`. */
export function installed(
  id: string,
  spec: InstalledSpec = {},
): {
  readonly record: InstalledRecord;
  readonly scope: InstallScope;
  readonly enabled: boolean | null;
} {
  const scope = spec.scope ?? 'user';
  const marketplace = id.slice(id.indexOf('@') + 1);
  return {
    scope,
    enabled: spec.enabled === undefined ? true : spec.enabled,
    record: {
      id,
      scope,
      ...(spec.auto === undefined ? {} : { autoInstalled: spec.auto }),
      ...(spec.version === undefined ? {} : { version: spec.version }),
      ...(spec.defaultEnabled === undefined ? {} : { defaultEnabled: spec.defaultEnabled }),
      dependencies: (spec.deps ?? []).map((item) => dep(item, marketplace)),
    },
  };
}

export type Installed = ReturnType<typeof installed>;

/** The facts of a catalog and the installed plugins; the same id may be installed at several scopes. */
export function facts(
  catalog: readonly (readonly [string, CatalogPlugin])[] = [],
  have: readonly Installed[] = [],
  rest: Partial<GraphFacts> = {},
): GraphFacts {
  const enabled: Partial<Record<InstallScope, Record<string, boolean>>> = {};
  for (const one of have) {
    if (one.enabled === null) continue;
    enabled[one.scope] = { ...enabled[one.scope], [one.record.id]: one.enabled };
  }
  return {
    installed: have.map((one) => one.record),
    enabled,
    catalog: Object.fromEntries(catalog),
    allowlists: {},
    ...rest,
  };
}
