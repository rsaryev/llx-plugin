import { RESTRICTS } from '../restricts.ts';
import type { PermissionRule } from '../types.ts';

/** Whether `rule` is an allow rule. */
export const isAllowRule = (rule: PermissionRule): boolean => !RESTRICTS[rule.behavior];
