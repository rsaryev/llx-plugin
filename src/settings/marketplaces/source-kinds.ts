import type { MarketplaceSource } from '../../protocol/official.ts';

/** The kinds of marketplace source an allow or block entry names (the official union's `source`). */
export type SourceKind = MarketplaceSource['source'];

/** The member of the union with that kind. */
export type SourceOf<K extends SourceKind> = Extract<MarketplaceSource, { readonly source: K }>;

/** Each kind with its member, the map TypeScript correlates a registry entry with its argument by. */
type Members = { readonly [K in SourceKind]: SourceOf<K> };

/** What differs per source kind: a registry typed over every member, so a new kind fails to compile. */
export type Registry<Rest extends readonly unknown[], T> = {
  readonly [K in SourceKind]: (member: Members[K], ...rest: Rest) => T;
};

/** The registry of functions of the source alone. */
export type ByKind<T> = Registry<[], T>;

/**
 * Asks a registry about a member. The mapped type ties each function to its own kind, which lets
 * the compiler accept `registry[kind](member)` with no cast.
 */
function apply<K extends SourceKind, Rest extends readonly unknown[], T>(
  registry: { readonly [P in K]: (member: Members[P], ...rest: Rest) => T },
  kind: K,
  member: Members[K],
  rest: Rest,
): T {
  return registry[kind](member, ...rest);
}

export const byKind = <T>(registry: ByKind<T>, source: MarketplaceSource): T =>
  apply(registry, source.source, source, []);

/** Asks a registry of functions that take more than the member. */
export const byKindWith = <Rest extends readonly unknown[], T>(
  registry: Registry<Rest, T>,
  source: MarketplaceSource,
  rest: Rest,
): T => apply(registry, source.source, source, rest);
