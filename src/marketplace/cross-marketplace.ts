import type { Marketplace } from '../format/marketplace/types.ts';
import { dependencyId } from './dependencies.ts';
import type { NormalizedDependency } from './types.ts';

/**
 * Cross-marketplace dependencies (plugins/dependencies.md, "Depend on a plugin from another
 * marketplace"; marketplace-reference.md, "Top-level fields"): a dependency in a marketplace other
 * than the declaring plugin's installs only when the root marketplace, the one that hosts the plugin
 * the user is installing, lists it in `allowCrossMarketplaceDependenciesOn` (its list alone applies,
 * for the whole dependency chain), or when the user already has the dependency enabled at the same
 * scope. The kit decides; the host installs or refuses.
 */

/** Where the dependency is declared: it decides what a refusal does. */
export type DeclaredIn = 'entry' | 'plugin.json';

/** What a refusal does: a marketplace entry's refuses the install; `plugin.json`'s installs without the dependency, and the plugin then fails to load. */
export type RefusalEffect = 'refuse-install' | 'install-without-dependency';

const EFFECTS: { readonly [P in DeclaredIn]: RefusalEffect } = {
  entry: 'refuse-install',
  'plugin.json': 'install-without-dependency',
};

export type CrossMarketplaceDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly message: string; readonly effect: RefusalEffect };

export interface CrossMarketplaceQuestion {
  readonly dep: NormalizedDependency;
  /** The plugin that declares the dependency; `marketplace` is absent for one that has none (loaded from claude.ai). */
  readonly requiredBy: { readonly name: string; readonly marketplace?: string };
  /** The marketplace that hosts the plugin the user is installing. */
  readonly root: Marketplace;
  /** `name@marketplace` of every plugin already enabled at the scope the install is for. */
  readonly enabledAtScope: ReadonlySet<string>;
  readonly declaredIn: DeclaredIn;
}

const refusal = (question: CrossMarketplaceQuestion): CrossMarketplaceDecision => {
  const { dep, requiredBy, root } = question;
  const by = dependencyId(
    requiredBy.marketplace === undefined
      ? { name: requiredBy.name }
      : { name: requiredBy.name, marketplace: requiredBy.marketplace },
  );
  return {
    allowed: false,
    effect: EFFECTS[question.declaredIn],
    // The text up to "allowlist" is quoted by the docs; the rest names the field to set (docs: "and names the field to set").
    message:
      `Dependency "${dependencyId(dep)}" (required by ${by}) is in marketplace "${dep.marketplace}", ` +
      `which is not in the allowlist; add it to "allowCrossMarketplaceDependenciesOn" in the marketplace.json of "${root.name}"`,
  };
};

/**
 * Judgments (spec/judgments.md): a dependency in the root marketplace itself needs no entry on its
 * list (the user chose that marketplace); a name is matched exactly; a dependency with no
 * marketplace is never cross-marketplace.
 */
export function crossMarketplaceDecision(
  question: CrossMarketplaceQuestion,
): CrossMarketplaceDecision {
  const { dep, requiredBy, root } = question;
  const target = dep.marketplace;
  if (target === undefined || target === requiredBy.marketplace || target === root.name) {
    return { allowed: true };
  }
  if (root.allowCrossMarketplaceDependenciesOn.includes(target)) return { allowed: true };
  return question.enabledAtScope.has(dependencyId(dep)) ? { allowed: true } : refusal(question);
}
