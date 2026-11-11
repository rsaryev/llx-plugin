import type { PermissionBehavior } from '../protocol/official.ts';

/**
 * Whether a rule of each behavior restricts what runs (deny, ask) rather than grants it (allow).
 * The docs widen what a restricting rule reaches and narrow what a granting one does, each time for
 * the same reason, the safe side: a deny or ask rule matches past any leading assignment, guards an
 * exact path a glob cannot express, covers what the kit cannot read, reaches the real directory of a
 * symlink, and so on. Each place that differs by behavior reads this one table.
 */
export const RESTRICTS: { readonly [B in PermissionBehavior]: boolean } = {
  allow: false,
  deny: true,
  ask: true,
};
