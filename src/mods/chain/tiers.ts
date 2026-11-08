import type { ModTier } from '../../protocol/mods-events.ts';
import type { SkipTier } from '../types.ts';

/** Where a tier stands in the chain: lower runs first (events.md, "The order mods run in"). */
export const TIER_RANK: { readonly [T in ModTier]: number } = {
  prepend: 0,
  user: 1,
  append: 2,
  builtin: 3,
  core: 4,
};

/** Which tiers `next.to` may be called from: only a mod in `prependPlugins` or `appendPlugins` (reference.md, "The hook function"). */
const MAY_SKIP: { readonly [T in ModTier]: boolean } = {
  prepend: true,
  user: false,
  append: true,
  builtin: false,
  core: false,
};

/** The tiers `next.to` names: a later tier, `append`, `builtin` or `core`. */
const SKIP_TIERS: readonly SkipTier[] = ['append', 'builtin', 'core'];

/** Why `next.to(e, tier)` from a hook of tier `from` is refused, or `undefined` when it is allowed. */
export function skipProblem(from: ModTier, tier: string): string | undefined {
  if (!MAY_SKIP[from]) {
    return 'next.to is only for a mod listed in prependPlugins or appendPlugins';
  }
  const target = SKIP_TIERS.find((candidate) => candidate === tier);
  if (target === undefined) return `next.to takes a later tier: ${SKIP_TIERS.join(', ')}`;
  return TIER_RANK[target] > TIER_RANK[from]
    ? undefined
    : `next.to skips ahead: ${target} is not after the ${from} tier`;
}
