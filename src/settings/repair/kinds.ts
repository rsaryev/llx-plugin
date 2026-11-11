import {
  blockedSources,
  channelAllowlist,
  closedStringList,
  stringList,
  strictSources,
} from './lists.ts';
import {
  asWritten,
  gatewayNetworks,
  matchMode,
  mcpAllowlist,
  mcpDenylist,
  modelDenylist,
  orgUuid,
  providerAllowlist,
} from './closed.ts';
import { hooks } from './hooks.ts';
import { allowedMcpServers, deniedMcpServers } from '../mcp/entries.ts';
import { autoModeBlock, consentBoolean } from '../permissions/auto-mode.ts';
import { disableValue, permissionsBlock } from '../permissions/read.ts';
import type { Repair } from './support.ts';
import {
  boolean,
  enabledPlugins,
  hooksSwitch,
  lockBoolean,
  marketplaceMap,
  pluginOnly,
  record,
  skillOverrides,
  string,
  workflowSize,
} from './values.ts';

/**
 * What to do with a value that does not have the type its key documents. One strategy per kind, so
 * what differs per key is a row of `KEY_SPECS`: the policy tier fails closed where the docs say so
 * (managed-settings.md, "Find entries Claude Code dropped"), every other source loses the value or
 * the entry.
 */
const REPAIR_KINDS = [
  'boolean',
  'lockBoolean',
  'hooksSwitch',
  'string',
  'stringList',
  'closedStringList',
  'channelAllowlist',
  'allowedMcpServers',
  'deniedMcpServers',
  'strictSources',
  'blockedSources',
  'enabledPlugins',
  'marketplaceMap',
  'record',
  'skillOverrides',
  'workflowSize',
  'pluginOnly',
  'hooks',
  'asWritten',
  'mcpAllowlist',
  'mcpDenylist',
  'providerAllowlist',
  'matchMode',
  'modelDenylist',
  'orgUuid',
  'gatewayNetworks',
  'permissions',
  'autoMode',
  'disableMode',
  'consentBoolean',
] as const;
export type RepairKind = (typeof REPAIR_KINDS)[number];

export const REPAIRS: { readonly [R in RepairKind]: Repair } = {
  boolean,
  lockBoolean,
  hooksSwitch,
  string,
  stringList,
  closedStringList,
  channelAllowlist,
  allowedMcpServers,
  deniedMcpServers,
  strictSources,
  blockedSources,
  enabledPlugins,
  marketplaceMap,
  record,
  skillOverrides,
  workflowSize,
  pluginOnly,
  hooks,
  asWritten,
  mcpAllowlist,
  mcpDenylist,
  providerAllowlist,
  matchMode,
  modelDenylist,
  orgUuid,
  gatewayNetworks,
  permissions: permissionsBlock,
  autoMode: autoModeBlock,
  disableMode: disableValue,
  consentBoolean,
};
