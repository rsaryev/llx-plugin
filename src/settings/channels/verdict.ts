import type { ChannelAllowlist, ChannelPluginRef } from './allowlist.ts';
import { isListed } from './allowlist.ts';
import type { ChannelGate } from './channel-gate.ts';

/** Why a channel plugin may or may not register. */
export const CHANNEL_REASONS = [
  'organizationAllowlist',
  'defaultAllowlist',
  'developmentFlag',
  'channelsNotEnabled',
  'notOnOrganizationList',
  'notOnDefaultList',
  'developmentFlagNeedsInteractive',
] as const;
export type ChannelReason = (typeof CHANNEL_REASONS)[number];

/** Which reasons let the channel register. */
const ADMITTED: { readonly [R in ChannelReason]: boolean } = {
  organizationAllowlist: true,
  defaultAllowlist: true,
  developmentFlag: true,
  channelsNotEnabled: false,
  notOnOrganizationList: false,
  notOnDefaultList: false,
  developmentFlagNeedsInteractive: false,
};

export interface ChannelVerdict {
  readonly allowed: boolean;
  readonly reason: ChannelReason;
}

/**
 * How the plugin reached the session. A plugin passed to `--channels` faces the allowlist; one passed
 * to `--dangerously-load-development-channels` skips it, per entry, in an interactive session only
 * (channels-reference.md, "Test during the research preview"). Either way the user opted in: "no
 * channel runs until a user opts it in for the session" (channels.md, "Enterprise controls").
 */
export interface ChannelRequestOptions {
  readonly development?: { readonly interactive: boolean };
}

const verdict = (reason: ChannelReason): ChannelVerdict => ({ allowed: ADMITTED[reason], reason });

const LISTED_REASON: {
  readonly [S in ChannelAllowlist['source']]: readonly [ChannelReason, ChannelReason];
} = {
  organization: ['organizationAllowlist', 'notOnOrganizationList'],
  default: ['defaultAllowlist', 'notOnDefaultList'],
};

/** The gate first (it blocks the development flag too), then the flag, then the allowlist. */
export function channelVerdict(
  gate: ChannelGate,
  allowlist: ChannelAllowlist,
  ref: ChannelPluginRef,
  options: ChannelRequestOptions = {},
): ChannelVerdict {
  if (!gate.open) return verdict('channelsNotEnabled');
  if (options.development !== undefined) {
    return verdict(
      options.development.interactive ? 'developmentFlag' : 'developmentFlagNeedsInteractive',
    );
  }
  const [listed, missing] = LISTED_REASON[allowlist.source];
  return verdict(isListed(allowlist.entries, ref) ? listed : missing);
}
