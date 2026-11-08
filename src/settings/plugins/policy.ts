import type { PolicyView } from '../view.ts';
import { enabledPlugin, forceEnabledByManaged, type EnabledDecision } from './enabled-plugins.ts';
import { modOrder, type ModOrderContext, type ModOrderResult } from './mod-order.ts';
import { pluginConfig, type PluginConfig } from './plugin-config.ts';
import { suggestionMarketplaces, type RegisteredMarketplaces } from './suggestions.ts';
import { syncDecision, type SyncDecision } from './sync-plugins.ts';
import { trustWarning } from './trust-warning.ts';

/**
 * The plugin keys of the settings as one object over a view (docs/API.md, "Settings").
 */
export interface PluginSettingsPolicy {
  enabled(id: string, manifestDefaultEnabled?: boolean): EnabledDecision;
  forceEnabledByManaged(id: string): boolean;
  config(id: string): PluginConfig;
  modOrder(orgMods: ReadonlySet<string>): ModOrderResult;
  syncClaudeAiPlugins(): SyncDecision;
  trustWarning(standard?: string): string;
  suggestionMarketplaces(registered: RegisteredMarketplaces): readonly string[];
}

export function createPluginSettingsPolicy(
  view: PolicyView,
  context: ModOrderContext,
): PluginSettingsPolicy {
  return {
    enabled: (id, manifestDefaultEnabled) => enabledPlugin(view, id, manifestDefaultEnabled),
    forceEnabledByManaged: (id) => forceEnabledByManaged(view, id),
    config: (id) => pluginConfig(view, id),
    modOrder: (orgMods) => modOrder(view, context, orgMods),
    syncClaudeAiPlugins: () => syncDecision(view),
    trustWarning: (standard) => trustWarning(view, standard),
    suggestionMarketplaces: (registered) => suggestionMarketplaces(view, registered),
  };
}
