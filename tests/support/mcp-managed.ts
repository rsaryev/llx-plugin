/** Helpers for the managed MCP tests: the docs' servers, a load plan with defaults, and a policy with a device tier. */
import type { PluginMcpServer } from '../../src/format/mcp-config.ts';
import {
  resolvePolicy,
  type PolicyContext,
  type PolicyLayer,
  type ResolvedPolicy,
} from '../../src/settings/index.ts';
import {
  mcpLoadPlan,
  type McpCandidate,
  type McpLoadInput,
  type McpLoadPlan,
  type McpLoadSettings,
} from '../../src/settings/mcp/index.ts';
import { policyOf } from './mcp-policy.ts';
import { layerOf } from './settings-layers.ts';
import type { Source } from './plugin-settings.ts';

export const NO_SETTINGS: McpLoadSettings = {
  allowAllClaudeAiMcps: false,
  allowClaudeInChromeWithManagedMcp: false,
  disableClaudeAiConnectors: false,
  pluginOnlyMcp: false,
};

export const http = (url: string): PluginMcpServer => ({ type: 'http', url });

/** A candidate of any scope but the managed one, which the plan builds itself. */
export const configured = (
  scope: 'local' | 'project' | 'user' | 'plugin' | 'connector',
  name: string,
  server: PluginMcpServer = http(`https://${name.replace(/\W+/g, '-')}.example.com/mcp`),
): McpLoadInput['candidates'][number] => ({ scope, name, server });

/** A server the organization provides, as `readManagedMcpServers` returns it. */
export const provided = (name: string, url: string): McpCandidate => ({
  scope: 'managed',
  name,
  server: http(url),
});

/** A load plan with a workstation session, no settings and no lists unless the test says otherwise. */
export const planOf = (overrides: Partial<McpLoadInput> = {}): McpLoadPlan =>
  mcpLoadPlan({
    managedFile: undefined,
    managedServers: [],
    candidates: [],
    settings: NO_SETTINGS,
    policy: policyOf([]),
    session: { cloud: false },
    ...overrides,
  });

/** `source:name` of each planned server. */
export const plannedLabels = (plan: McpLoadPlan): readonly string[] =>
  plan.servers.map((each) => `${each.source}:${each.name}`);

/** The names the plan loads, sorted. */
export const plannedNames = (plan: McpLoadPlan): readonly string[] =>
  plan.servers.map((each) => each.name).toSorted();

const plainMachine: PolicyContext = {
  account: 'claudeaiPersonal',
  plan: { pro: false },
  hasManagedSettings: false,
  parentMerge: false,
  isFolderTrusted: () => true,
  env: {},
  defaultChannelAllowlist: [],
  officialMarketplaces: ['claude-plugins-official'],
};

/** The policy of `sources`, with `device` as the managed layers of the device itself (MDM, HKLM, system file). */
export const resolvedOnDevice = (
  sources: readonly Source[],
  device: readonly PolicyLayer[] = [],
  context: Partial<PolicyContext> = {},
): ResolvedPolicy =>
  resolvePolicy({
    layers: sources.map(([scope, raw]) => layerOf(scope, raw)),
    context: { ...plainMachine, ...context },
    deviceManaged: device,
  });

export const managedLayer = (raw: unknown): PolicyLayer => layerOf('managed', raw);
