import type { ChannelPluginRef } from '../../protocol/official.ts';
import type { PolicyView } from '../view.ts';
import type { ChannelAccount, ChannelsContext } from './channel-gate.ts';

/** What the host tells the allowlist besides the layers. */
export interface ChannelAllowlistContext extends ChannelsContext {
  /**
   * The Anthropic-maintained default allowlist. Its content is not in the docs ("the channel plugins
   * in claude-plugins-official are the default approved set", channels.md), so the host supplies it.
   */
  readonly defaultChannelAllowlist: readonly ChannelPluginRef[];
}

export interface ChannelAllowlist {
  /** `organization` when `allowedChannelPlugins` replaced the default, `default` otherwise. */
  readonly source: 'organization' | 'default';
  readonly entries: readonly ChannelPluginRef[];
}

/**
 * Whether an account reads `allowedChannelPlugins`: Pro, Max and Ultra without an organization "skip
 * these checks entirely" (channels.md, "Enterprise controls"), so they stay on the default list.
 */
const READS_ORGANIZATION_LIST: { readonly [A in ChannelAccount]: boolean } = {
  claudeaiTeamEnterprise: true,
  claudeaiPersonal: false,
  console: true,
};

/**
 * The allowlist in force. `allowedChannelPlugins` "replaces the Anthropic-maintained list when set",
 * an empty list included, and is taken whole from the highest managed source (managed-settings.md,
 * "Restriction allowlists"; the view's merge). Entries are `{ plugin, marketplace }`: the string
 * `plugin@marketplace` was read as the equivalent object when the layer was read. An account without
 * an organization skips the key (channels.md, "Enterprise controls"; spec/judgments.md).
 */
export function effectiveChannelAllowlist(
  view: PolicyView,
  context: ChannelAllowlistContext,
): ChannelAllowlist {
  const organization = READS_ORGANIZATION_LIST[context.account]
    ? view.get('allowedChannelPlugins')
    : undefined;
  if (organization === undefined)
    return { source: 'default', entries: context.defaultChannelAllowlist };
  return { source: 'organization', entries: organization };
}

/** Whether the list names this plugin from this marketplace: both names exactly, case included. */
export const isListed = (list: readonly ChannelPluginRef[], ref: ChannelPluginRef): boolean =>
  list.some((entry) => entry.plugin === ref.plugin && entry.marketplace === ref.marketplace);
