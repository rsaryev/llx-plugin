import type { PermissionBehavior } from '../../protocol/official.ts';
import type { PermissionRule } from '../types.ts';

/** Whether a rule of each behavior grants the call (typed over the SDK's union, so a new behavior needs an answer). */
const GRANTS: { readonly [B in PermissionBehavior]: boolean } = {
  allow: true,
  ask: false,
  deny: false,
};

/** Whether `rule` is an allow rule. */
export const isAllowRule = (rule: PermissionRule): boolean => GRANTS[rule.behavior];
