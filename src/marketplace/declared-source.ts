import type { MarketplaceSource } from '../format/marketplace/types.ts';
import { sameMarketplaceSource } from './known-marketplaces.ts';

/**
 * Adding a marketplace whose `name` already has an `extraKnownMarketplaces` entry in user or managed
 * settings (plugins/troubleshooting.md, "Cannot add marketplace "<name>": its source doesn't match its
 * extraKnownMarketplaces entry in user or managed settings"): the add is refused and registers nothing
 * unless the sources match. Pure; the host reads the entry.
 */

/** The text the docs quote since v2.1.287. */
export const declaredSourceMismatch = (name: string): string =>
  `Cannot add marketplace "${name}": its source doesn't match its extraKnownMarketplaces entry in user or managed settings`;

export interface DeclaredSourceFacts {
  readonly name: string;
  /** The source of the add, as `parseMarketplaceInput` built it. */
  readonly given: MarketplaceSource;
  /** The source the user or managed `extraKnownMarketplaces` entry lists for that name; absent when none does. */
  readonly declared?: MarketplaceSource;
}

/**
 * "Two sources match when they have the same type and the same value in every field. An entry that sets a
 * `ref` you didn't pass counts as different. A `github` entry also counts as different when you gave the
 * repository as an `https://github.com/` URL, because Claude Code records that URL as a `git` source."
 * `undefined` when there is nothing to refuse.
 */
export function declaredSourceRefusal(facts: DeclaredSourceFacts): string | undefined {
  if (facts.declared === undefined || sameMarketplaceSource(facts.given, facts.declared)) {
    return undefined;
  }
  return declaredSourceMismatch(facts.name);
}

/** The fix the docs give first: "Use the declared source", typed as the entry writes it. */
export function declaredSourceFix(declared: MarketplaceSource): string | undefined {
  if (!('repo' in declared)) return undefined;
  const ref = 'ref' in declared && declared.ref !== undefined ? `#${declared.ref}` : '';
  return `/plugin marketplace add ${declared.repo}${ref}`;
}
