import type { PolicyEnv } from '../context.ts';
import type { PolicyLayer } from '../layers.ts';
import { createPolicyView, type PolicyView } from '../view.ts';

/** The switches that decide what loads next to, or instead of, the MCP servers a user configured. */
export interface McpLoadSettings {
  /** `allowAllClaudeAiMcps`: the connectors Claude Code fetches load alongside `managed-mcp.json`. */
  readonly allowAllClaudeAiMcps: boolean;
  /** `allowClaudeInChromeWithManagedMcp`, from the device's own managed settings only. */
  readonly allowClaudeInChromeWithManagedMcp: boolean;
  /** `disableClaudeAiConnectors` in any file, or `ENABLE_CLAUDEAI_MCP_SERVERS=false`. */
  readonly disableClaudeAiConnectors: boolean;
  /** `strictPluginOnlyCustomization` locks the `mcp` surface. */
  readonly pluginOnlyMcp: boolean;
}

export interface McpLoadFacts {
  readonly env: PolicyEnv;
  /**
   * The managed layers of the device itself: an MDM plist, an HKLM registry key, a system
   * `managed-settings.json`. A layer has one `managed` scope, so the host says which of its managed
   * layers these are (spec/judgments.md).
   */
  readonly deviceManaged: readonly PolicyLayer[];
  readonly pluginOnlyMcp: boolean;
}

/**
 * `allowAllClaudeAiMcps` is "read ... only from admin-controlled policy tiers" and among the keys
 * "read from every admin source"; `disableClaudeAiConnectors` is a `true` "in any settings file"
 * (and the environment switch of the same effect, which the setting cannot undo);
 * `allowClaudeInChromeWithManagedMcp` is "read ... only from those device sources". A `true` from
 * any holder applies (the rows' ladder) (spec/judgments.md for the combination of admin sources).
 */
export function readMcpLoadSettings(view: PolicyView, facts: McpLoadFacts): McpLoadSettings {
  const device = createPolicyView(facts.deviceManaged);
  return {
    allowAllClaudeAiMcps: view.get('allowAllClaudeAiMcps') === true,
    allowClaudeInChromeWithManagedMcp: device.get('allowClaudeInChromeWithManagedMcp') === true,
    disableClaudeAiConnectors:
      view.get('disableClaudeAiConnectors') === true ||
      facts.env.ENABLE_CLAUDEAI_MCP_SERVERS === 'false',
    pluginOnlyMcp: facts.pluginOnlyMcp,
  };
}
