import type { ChannelPluginRef } from '../../protocol/official.ts';
import type { ChannelAllowlist } from './allowlist.ts';
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

/** The two flags that carry a channel into a session. */
export const CHANNEL_ORIGINS = ['channels', 'development'] as const;
export type ChannelOrigin = (typeof CHANNEL_ORIGINS)[number];

/** What each flag's entry tells the verdict, beyond the flag it came from. */
interface EntryByOrigin {
  /** `--channels plugin:<name>@<marketplace>`: faces the allowlist. */
  readonly channels: { readonly plugin: ChannelPluginRef };
  /**
   * `--dangerously-load-development-channels`, `plugin:<name>@<marketplace>` or a bare
   * `server:<name>`: skips the allowlist, so the verdict reads no plugin; it is set for the first form.
   */
  readonly development: { readonly interactive: boolean; readonly plugin?: ChannelPluginRef };
}

/**
 * One entry a user passed for the session, with the flag it came from. "The bypass is per-entry":
 * the development flag skips the list for its own entries only, and "doesn't extend the bypass to the
 * `--channels` entries" (channels-reference.md, "Test during the research preview"). Either way the
 * user opted in: "no channel runs until a user opts it in for the session" (channels.md, "Enterprise
 * controls").
 */
export type ChannelEntry = {
  readonly [O in ChannelOrigin]: { readonly origin: O } & EntryByOrigin[O];
}[ChannelOrigin];

type OriginRule<O extends ChannelOrigin> = (
  entry: EntryByOrigin[O],
  allowlist: ChannelAllowlist,
) => ChannelReason;

const ORIGIN_RULES: { readonly [O in ChannelOrigin]: OriginRule<O> } = {
  channels: (entry, allowlist) => {
    const [listed, missing] = LISTED_REASON[allowlist.source];
    return isListed(allowlist.entries, entry.plugin) ? listed : missing;
  },
  // Run in an interactive session, where Claude Code can show the confirmation prompt; elsewhere it
  // "ignores the flag and the channel doesn't register".
  development: (entry) =>
    entry.interactive ? 'developmentFlag' : 'developmentFlagNeedsInteractive',
};

const LISTED_REASON: {
  readonly [S in ChannelAllowlist['source']]: readonly [ChannelReason, ChannelReason];
} = {
  organization: ['organizationAllowlist', 'notOnOrganizationList'],
  default: ['defaultAllowlist', 'notOnDefaultList'],
};

const verdict = (reason: ChannelReason): ChannelVerdict => ({ allowed: ADMITTED[reason], reason });

const reasonFor = <O extends ChannelOrigin>(
  entry: { readonly origin: O } & EntryByOrigin[O],
  allowlist: ChannelAllowlist,
): ChannelReason => ORIGIN_RULES[entry.origin](entry, allowlist);

/** The gate first (it blocks the development flag too), then the entry's own flag rule. */
export function channelVerdict(
  gate: ChannelGate,
  allowlist: ChannelAllowlist,
  entry: ChannelEntry,
): ChannelVerdict {
  return verdict(gate.open ? reasonFor(entry, allowlist) : 'channelsNotEnabled');
}
