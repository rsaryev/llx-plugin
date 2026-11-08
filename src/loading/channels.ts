import { error, type PluginIssue } from '../format/issues.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';

/**
 * A `channels` entry is "bound to one of the plugin's MCP servers": `server` is the "Key of the MCP
 * server in this plugin's `mcpServers` that the channel binds to" (plugins/manifest-reference.md,
 * "Channels"). The keys are those loading found, from `.mcp.json`, a file or the manifest.
 * Judgment: an entry bound to no server is an error issue, and the plugin still loads without that
 * channel (spec/judgments.md).
 */
export const channelBindingMessage = (server: string): string =>
  `Channel server "${server}" is not a key of this plugin's mcpServers`;

export function channelIssues(
  manifest: PluginManifest | undefined,
  servers: Readonly<Record<string, unknown>>,
): PluginIssue[] {
  return (manifest?.channels ?? []).flatMap((channel, index) =>
    Object.hasOwn(servers, channel.server)
      ? []
      : [error(`channels[${index}].server`, channelBindingMessage(channel.server))],
  );
}
