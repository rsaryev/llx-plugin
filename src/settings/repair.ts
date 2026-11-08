import {
  blockedSources,
  channelAllowlist,
  closedStringList,
  stringList,
  strictSources,
} from './repair-lists.ts';
import { hooks } from './repair-hooks.ts';
import type { Repair } from './repair-support.ts';
import {
  boolean,
  enabledPlugins,
  lockBoolean,
  marketplaceMap,
  pluginOnly,
  record,
  skillOverrides,
  string,
  workflowSize,
} from './repair-values.ts';

/**
 * What to do with a value that does not have the type its key documents. One strategy per kind, so
 * what differs per key is a row of `KEY_SPECS`: the policy tier fails closed where the docs say so
 * (managed-settings.md, "Find entries Claude Code dropped"), every other source loses the value or
 * the entry.
 */
export const REPAIR_KINDS = [
  'boolean',
  'lockBoolean',
  'string',
  'stringList',
  'closedStringList',
  'channelAllowlist',
  'strictSources',
  'blockedSources',
  'enabledPlugins',
  'marketplaceMap',
  'record',
  'skillOverrides',
  'workflowSize',
  'pluginOnly',
  'hooks',
] as const;
export type RepairKind = (typeof REPAIR_KINDS)[number];

export const REPAIRS: { readonly [R in RepairKind]: Repair } = {
  boolean,
  lockBoolean,
  string,
  stringList,
  closedStringList,
  channelAllowlist,
  strictSources,
  blockedSources,
  enabledPlugins,
  marketplaceMap,
  record,
  skillOverrides,
  workflowSize,
  pluginOnly,
  hooks,
};
