/**
 * settings-reference.md § `channelsEnabled` (Scope "Managed"; `true` allows channels for the
 * organization; "`false`: the same as unset"; Default "channels are blocked on Team and Enterprise
 * plans and on Console accounts with managed settings, and allowed on Pro, Max, and Ultra plans and
 * on Console accounts without managed settings"), channels.md § Enterprise controls ("Admins control
 * availability through two managed settings that users cannot override"; the table: "Master switch
 * ... Blocks all channels including the development flag when off"; "Pro, Max, and Ultra users
 * without an organization skip these checks entirely"), § Enable channels for your organization ("If
 * the setting is disabled or unset, the MCP server still connects and its tools work, but channel
 * messages won't arrive. A startup warning tells the user to have an admin enable the setting"),
 * channels-reference.md § Test during the research preview ("This flag skips the allowlist only. The
 * `channelsEnabled` organization policy still applies").
 */
import { describe, expect, test } from 'bun:test';
import {
  channelGate,
  createChannelSettingsPolicy,
  type ChannelsContext,
} from '../../../src/settings/channels/index.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const team: ChannelsContext = { account: 'claudeaiTeamEnterprise', hasManagedSettings: false };
const personal: ChannelsContext = { account: 'claudeaiPersonal', hasManagedSettings: false };
const consolePlain: ChannelsContext = { account: 'console', hasManagedSettings: false };
const consoleManaged: ChannelsContext = { account: 'console', hasManagedSettings: true };
const enabled = ['managed', { channelsEnabled: true }] as const;
const telegram = { plugin: 'telegram', marketplace: 'claude-plugins-official' };

spec('settings.key.channelsEnabled', () => {
  test('Team and Enterprise: blocked until true, with the startup warning for an admin', () => {
    const unset = channelGate(viewOf(), team);
    expect(unset.open).toBe(false);
    expect(unset.by).toBeUndefined();
    expect(unset.startupWarning).toBe('adminMustEnable');
    const set = channelGate(viewOf(enabled), team);
    expect(set.open).toBe(true);
    expect(set.by).toBe('channelsEnabled');
    expect(set.startupWarning).toBeUndefined();
  });

  test('false is the same as unset, on every account that depends on the key', () => {
    const off = viewOf(['managed', { channelsEnabled: false }]);
    expect(channelGate(off, team)).toEqual(channelGate(viewOf(), team));
    expect(channelGate(off, consoleManaged)).toEqual(channelGate(viewOf(), consoleManaged));
    expect(channelGate(off, team).open).toBe(false);
  });

  test('Console with an API key: allowed by default, blocked once managed settings are deployed until true', () => {
    expect(channelGate(viewOf(), consolePlain)).toMatchObject({ open: true, by: 'consoleDefault' });
    expect(channelGate(viewOf(), consoleManaged).open).toBe(false);
    expect(channelGate(viewOf(enabled), consoleManaged)).toMatchObject({
      open: true,
      by: 'channelsEnabled',
    });
  });

  test('a managed layer is itself managed settings, whatever the host says', () => {
    const view = viewOf(['managed', { allowedChannelPlugins: [] }]);
    expect(channelGate(view, consolePlain).open).toBe(false);
  });

  test('Pro, Max and Ultra without an organization skip the check: open with the key unset or false', () => {
    expect(channelGate(viewOf(), personal)).toMatchObject({ open: true, by: 'noOrganization' });
    const off = viewOf(['managed', { channelsEnabled: false }]);
    expect(channelGate(off, personal).open).toBe(true);
  });

  test('users cannot override it: the key counts from managed settings only', () => {
    for (const scope of ['user', 'project', 'local', 'flag'] as const) {
      expect(channelGate(viewOf([scope, { channelsEnabled: true }]), team).open).toBe(false);
    }
    const locked = viewOf(
      ['managed', { channelsEnabled: false }],
      ['user', { channelsEnabled: true }],
    );
    expect(channelGate(locked, team).open).toBe(false);
  });

  test('when it is off the development flag is blocked too, and the verdict names the key', () => {
    const policy = createChannelSettingsPolicy(viewOf(), {
      ...team,
      defaultChannelAllowlist: [],
    });
    const ref = { plugin: 'mine', marketplace: 'local' };
    const verdict = policy.allowed(ref, { development: { interactive: true } });
    expect(verdict).toEqual({ allowed: false, reason: 'channelsNotEnabled' });
    expect(policy.allowed(ref)).toEqual({ allowed: false, reason: 'channelsNotEnabled' });
  });

  test('an unset key keeps the MCP server connected: the verdict is about channel messages only', () => {
    // The kit does not start servers; the verdict says whether messages may register as a channel.
    const policy = createChannelSettingsPolicy(viewOf(), {
      ...team,
      defaultChannelAllowlist: [telegram],
    });
    expect(policy.allowed(telegram).allowed).toBe(false);
    expect(policy.gate().startupWarning).toBe('adminMustEnable');
  });
});

describe('the gate of a view that carries no channel keys', () => {
  test('is a plain value: nothing throws on an empty view', () => {
    expect(channelGate(viewOf(), team)).toEqual({
      open: false,
      by: undefined,
      startupWarning: 'adminMustEnable',
    });
  });
});
