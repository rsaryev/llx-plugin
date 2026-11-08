import type { PolicyView } from '../view.ts';
import {
  effectiveChannelAllowlist,
  type ChannelAllowlist,
  type ChannelAllowlistContext,
  type ChannelPluginRef,
} from './allowlist.ts';
import { channelGate, type ChannelGate } from './channel-gate.ts';
import { channelVerdict, type ChannelRequestOptions, type ChannelVerdict } from './verdict.ts';

/** What the host tells the channel keys besides the layers. */
export type ChannelPolicyContext = ChannelAllowlistContext;

/** The channel keys of the settings as one object over a view (docs/API.md, "Settings"). */
export interface ChannelSettingsPolicy {
  /** `channelsEnabled`: whether channels may deliver messages on this account. */
  gate(): ChannelGate;
  /** `allowedChannelPlugins` over the host's default list. */
  allowlist(): ChannelAllowlist;
  /** Whether a plugin the user opted in for the session may register as a channel. */
  allowed(plugin: ChannelPluginRef, options?: ChannelRequestOptions): ChannelVerdict;
}

export function createChannelSettingsPolicy(
  view: PolicyView,
  context: ChannelPolicyContext,
): ChannelSettingsPolicy {
  const gate = channelGate(view, context);
  const allowlist = effectiveChannelAllowlist(view, context);
  return {
    gate: () => gate,
    allowlist: () => allowlist,
    allowed: (plugin, options) => channelVerdict(gate, allowlist, plugin, options),
  };
}
