import { error, type PluginIssue } from '../../format/issues.ts';
import { channelBindingMessage } from '../channels.ts';
import type { PluginChannel } from '../../format/manifest-schema.ts';
import type { PluginMcpServer } from '../../format/mcp-config.ts';
import { resolveMcpServer, type ResolvedMcpServer } from './mcp.ts';
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
 * Resolves one channel against the plugin's servers. "Saved values substitute into
 * `${user_config.KEY}` references in the server's `env`": the channel's options join the plugin's
 * for this server, so `${user_config.bot_token}` in `env` takes the channel's `bot_token` (a
 * channel option wins over a top-level one of the same key; judgment, spec/judgments.md).
 */
export async function resolveChannel(
  channel: PluginChannel,
  servers: Readonly<Record<string, PluginMcpServer>>,
  scope: SubstitutionScope,
): Promise<ChannelResolution> {
  const server = Object.hasOwn(servers, channel.server) ? servers[channel.server] : undefined;
  if (server === undefined) {
    const issue = error('channels.server', channelBindingMessage(channel.server));
    return { resolved: undefined, issues: [issue] };
  }
  const userConfig = channel.userConfig ?? {};
  const bound = await resolveMcpServer(channel.server, server, {
    ...scope,
    userConfig: { ...scope.userConfig, declared: { ...scope.userConfig.declared, ...userConfig } },
  });
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
