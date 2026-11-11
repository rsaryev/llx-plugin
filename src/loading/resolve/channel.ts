import { error, type PluginIssue } from '../../format/issues.ts';
import { channelBindingMessage } from '../channels.ts';
import type { PluginChannel } from '../../format/manifest-schema.ts';
import { resolveMcpServer, type McpResolution, type ResolvedMcpServer } from './mcp.ts';
import type { PluginMcpServer } from '../../format/mcp-config.ts';
import type { Plugin } from '../plugin-model.ts';
import { bundleScope } from './bundle-scope.ts';
import type { SubstitutionScope } from './scope.ts';

/**
 * A channel of a plugin as the dialog and the host need it (plugins/manifest-reference.md,
 * "Channels"): the MCP server it binds to, the name shown in the configuration dialog title, the
 * options to prompt for, and the server's config with the saved values substituted into `env`.
 */
export interface ResolvedChannel {
  /** The key of the plugin's MCP server the channel binds to. */
  readonly server: string;
  /** "Name shown in the configuration dialog title. Defaults to the server name". */
  readonly displayName: string;
  /** The options to prompt for, in the shape of the top-level `userConfig`. */
  readonly userConfig: NonNullable<PluginChannel['userConfig']>;
  /** The bound server resolved with the channel's options; undefined when it does not start. */
  readonly mcp: ResolvedMcpServer | undefined;
}

export interface ChannelResolution {
  /** Undefined when the channel is bound to no server of the plugin. */
  readonly resolved: ResolvedChannel | undefined;
  readonly issues: readonly PluginIssue[];
}

/**
 * The scope of the server a channel binds to: the channel's options join the plugin's, a channel
 * option winning over a top-level one of the same key (judgment, spec/judgments.md).
 */
const channelScope = (scope: SubstitutionScope, channel: PluginChannel): SubstitutionScope => ({
  ...scope,
  userConfig: {
    ...scope.userConfig,
    declared: { ...scope.userConfig.declared, ...channel.userConfig },
  },
});

/**
 * Resolves one MCP server of a plugin, the one rule both `resolveMcpServers` and `resolveChannel`
 * take: a bundled server with its bundle's own settings only (`bundleScope`, which may keep it from
 * starting; a channel's options do not join them: judgment, spec/judgments.md), any other with the
 * options of the channel that binds it joined to the plugin's.
 */
export function resolvePluginServer(
  plugin: Pick<Plugin, 'mcpBundles'>,
  { name, server }: { readonly name: string; readonly server: PluginMcpServer },
  channel: PluginChannel | undefined,
  scope: SubstitutionScope,
): Promise<McpResolution> {
  const bundle = Object.hasOwn(plugin.mcpBundles, name) ? plugin.mcpBundles[name] : undefined;
  if (bundle === undefined) {
    return resolveMcpServer(name, server, channel ? channelScope(scope, channel) : scope);
  }
  const bound = bundleScope(scope, name, bundle);
  if ('issue' in bound) return Promise.resolve({ resolved: undefined, issues: [bound.issue] });
  return resolveMcpServer(name, server, bound.scope);
}

/**
 * Resolves one channel against the plugin's servers. "Saved values substitute into
 * `${user_config.KEY}` references in the server's `env`": the channel's options join the plugin's
 * for this server, so `${user_config.bot_token}` in `env` takes the channel's `bot_token` (a
 * channel option wins over a top-level one of the same key; judgment, spec/judgments.md). A bundled
 * server reads its bundle's settings (`Plugin.mcpBundles`), as it does in `resolveMcpServers`.
 */
export async function resolveChannel(
  channel: PluginChannel,
  plugin: Pick<Plugin, 'mcpServers' | 'mcpBundles'>,
  scope: SubstitutionScope,
): Promise<ChannelResolution> {
  const servers = plugin.mcpServers;
  const server = Object.hasOwn(servers, channel.server) ? servers[channel.server] : undefined;
  if (server === undefined) {
    const issue = error('channels.server', channelBindingMessage(channel.server));
    return { resolved: undefined, issues: [issue] };
  }
  const userConfig = channel.userConfig ?? {};
  const bound = await resolvePluginServer(plugin, { name: channel.server, server }, channel, scope);
  return {
    resolved: {
      server: channel.server,
      displayName: channel.displayName ?? channel.server,
      userConfig,
      mcp: bound.resolved,
    },
    issues: bound.issues,
  };
}
