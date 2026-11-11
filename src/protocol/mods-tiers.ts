/**
 * A mod's priority group, in the order the chain runs them (events.md, "The order mods run in"):
 * mods your organization lists in `prependPlugins`, mods you install, `appendPlugins`, other mods
 * built into Claude Code, then Claude Code's own behaviour (`core`).
 */
export const MOD_TIERS = ['prepend', 'user', 'append', 'builtin', 'core'] as const;
export type ModTier = (typeof MOD_TIERS)[number];
