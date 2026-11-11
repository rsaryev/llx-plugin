/**
 * How a seed's marketplaces enter the registry (plugins/org.md, "Seed containers and CI"): "Claude
 * Code registers the marketplace from these directories at startup"; "Claude Code uses the first seed
 * that contains a given marketplace"; "a marketplace declared in the seed overwrites the user's entry
 * of the same name"; the seed is read-only and "forces `autoUpdate` off for seed marketplaces".
 * Pure: the host reads `known_marketplaces.json` of each directory and applies the result.
 */

/** What the kit needs of a registry entry. */
export interface SeededEntry {
  readonly autoUpdate?: boolean;
}

/** One seed directory and the marketplaces its `known_marketplaces.json` declares. */
export interface Seed<E extends SeededEntry> {
  readonly directory: string;
  readonly marketplaces: Readonly<Record<string, E>>;
}

export interface RegistryEntry<E extends SeededEntry> {
  readonly entry: E;
  /** The seed directory that supplies it; the entry is read-only while this is set. */
  readonly seedDirectory?: string;
}

/**
 * The registry after the seeds: every user entry, replaced where a seed declares the same name, and
 * every seed marketplace the user has no entry for. `seeds` is in the order of the path list.
 */
export function applySeeds<E extends SeededEntry>(
  user: Readonly<Record<string, E>>,
  seeds: readonly Seed<E>[],
): Readonly<Record<string, RegistryEntry<E>>> {
  const registry = new Map<string, RegistryEntry<E>>(
    Object.entries(user).map(([name, entry]) => [name, { entry }]),
  );
  const claimed = new Set<string>();
  for (const seed of seeds) {
    for (const [name, entry] of Object.entries(seed.marketplaces)) {
      if (claimed.has(name)) continue;
      claimed.add(name);
      registry.set(name, { entry: { ...entry, autoUpdate: false }, seedDirectory: seed.directory });
    }
  }
  return Object.fromEntries(registry);
}
