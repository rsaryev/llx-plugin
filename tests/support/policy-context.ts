/** Helpers for the composed policy tests: a machine as a host describes it, and the policy over sources. */
import {
  resolvePolicy,
  type PolicyContext,
  type ResolvedPolicy,
} from '../../src/settings/index.ts';
import type { PluginIssue } from '../../src/format/index.ts';
import { layerOf } from './settings-layers.ts';
import type { Source } from './plugin-settings.ts';

/** A signed-in Pro-less claude.ai account on a machine with no administrator and trusted folders. */
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

/** The policy of the sources, read the way a host reads them, in the order given. */
export const resolved = (
  sources: readonly Source[],
  context: Partial<PolicyContext> = {},
  issues: readonly PluginIssue[] = [],
): ResolvedPolicy =>
  resolvePolicy({
    layers: sources.map(([scope, raw]) => layerOf(scope, raw)),
    context: { ...plainMachine, ...context },
    issues,
  });
