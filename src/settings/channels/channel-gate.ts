import type { PolicyView } from '../view.ts';

/**
 * The account kinds the `channelsEnabled` default depends on (settings-reference.md, `channelsEnabled`;
 * channels.md, "Enterprise controls"). The host tells which one the session is signed in with.
 */
export const CHANNEL_ACCOUNTS = ['claudeaiTeamEnterprise', 'claudeaiPersonal', 'console'] as const;
export type ChannelAccount = (typeof CHANNEL_ACCOUNTS)[number];

/** What the host tells the channel gate besides the layers: plain data, the kit reads no environment. */
export interface ChannelsContext {
  readonly account: ChannelAccount;
  /**
   * An administrator deploys managed settings on this machine or account. A managed layer among the
   * view's layers counts as managed settings too, so a host that cannot tell may pass `false`.
   */
  readonly hasManagedSettings: boolean;
}

/** What opened the gate. */
export type ChannelGateBy = 'noOrganization' | 'consoleDefault' | 'channelsEnabled';

export interface ChannelGate {
  readonly open: boolean;
  /** Why the gate is open; `undefined` while it is closed. */
  readonly by: ChannelGateBy | undefined;
  /**
   * "A startup warning tells the user to have an admin enable the setting" (channels.md, "Enable
   * channels for your organization"). The wording belongs to the host; this names the warning.
   */
  readonly startupWarning: 'adminMustEnable' | undefined;
}

/** What a gate rule needs: whether `channelsEnabled` is `true` and whether managed settings exist. */
interface GateInput {
  readonly enabled: boolean;
  readonly managed: boolean;
}

type GateRule = (input: GateInput) => ChannelGateBy | undefined;

const GATE_RULES: { readonly [A in ChannelAccount]: GateRule } = {
  // "Pro, Max, and Ultra users without an organization skip these checks entirely."
  claudeaiPersonal: () => 'noOrganization',
  // "channels are blocked until an Owner enables them."
  claudeaiTeamEnterprise: ({ enabled }) => (enabled ? 'channelsEnabled' : undefined),
  // "permitted by default ... If your organization deploys managed settings ... blocked until this
  // key is set."
  console: ({ enabled, managed }) => {
    if (enabled) return 'channelsEnabled';
    return managed ? undefined : 'consoleDefault';
  },
};

/**
 * The master switch: whether channels may deliver messages on this account. `channelsEnabled: false`
 * is "the same as unset" and the key counts from managed settings only (its Scope line, enforced by
 * the view), so a user cannot lift the block. A closed gate blocks every channel, the development
 * flag included (channels-reference.md, "Test during the research preview").
 */
export function channelGate(view: PolicyView, context: ChannelsContext): ChannelGate {
  const managed =
    context.hasManagedSettings || view.layers.some((layer) => layer.scope === 'managed');
  const by = GATE_RULES[context.account]({
    enabled: view.get('channelsEnabled') === true,
    managed,
  });
  return {
    open: by !== undefined,
    by,
    startupWarning: by === undefined ? 'adminMustEnable' : undefined,
  };
}
