/**
 * channels-reference.md § What you need, § Server options, § Notification format, § Expose a reply tool,
 * § Gate inbound messages, § Package as a plugin; channels.md § Security; plugins/components.md § Channels.
 */
import { expect, test } from 'bun:test';
import {
  channelCapabilities,
  channelInstructions,
  channelTag,
  channelVerdict,
  deliversChannelEvents,
  groupChannelEvents,
  isTwoWay,
  senderAllowed,
  type ChannelEntry,
} from '../../../src/settings/channels/index.ts';
import { channelGate } from '../../../src/settings/channels/channel-gate.ts';
import { viewOf } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const official = { plugin: 'telegram', marketplace: 'claude-plugins-official' };
const team = { account: 'claudeaiTeamEnterprise', hasManagedSettings: true } as const;
const gate = channelGate(viewOf(['managed', { channelsEnabled: true }]), team);
const allowlist = { source: 'default', entries: [official] } as const;

spec(
  ['channels.reference.What you need', 'channels.reference.Server options.capabilities.tools'],
  () => {
    test('presence of experimental claude/channel registers the listener', () => {
      expect(channelCapabilities({ experimental: { 'claude/channel': {} } }).channel).toBe(true);
      expect(channelCapabilities({ tools: {} }).channel).toBe(false);
      expect(channelCapabilities(undefined).channel).toBe(false);
    });
    test('tools makes a channel two-way; omitting it makes it one-way', () => {
      const two = channelCapabilities({ experimental: { 'claude/channel': {} }, tools: {} });
      const one = channelCapabilities({ experimental: { 'claude/channel': {} } });
      expect([isTwoWay(two), isTwoWay(one)]).toEqual([true, false]);
    });
    test('the permission capability is declared by {} and not by false or omission', () => {
      const caps = (value: unknown) =>
        channelCapabilities({
          experimental: { 'claude/channel': {}, 'claude/channel/permission': value },
        });
      expect(caps({}).permission).toBe(true);
      expect(caps(false).permission).toBe(false);
      expect(channelCapabilities({ experimental: { 'claude/channel': {} } }).permission).toBe(
        false,
      );
    });
  },
);

spec('channels.reference.Server options.instructions', () => {
  test('instructions reach Claude as context; none gives nothing', () => {
    expect(channelInstructions('Events arrive as <channel>')).toBe('Events arrive as <channel>');
    expect(channelInstructions(undefined)).toBeUndefined();
    expect(channelInstructions('')).toBeUndefined();
  });
});

spec('channels.reference.Notification format', () => {
  test('source is the server name and each meta key is an attribute', () => {
    expect(
      channelTag('your-channel', {
        content: 'build failed',
        meta: { severity: 'high', run_id: '1234' },
      }),
    ).toBe(
      '<channel source="your-channel" severity="high" run_id="1234">\nbuild failed\n</channel>',
    );
  });
  test('keys that are not identifiers are silently dropped', () => {
    const tag = channelTag('w', { content: 'x', meta: { 'a-b': '1', 'c d': '2', ok_1: '3' } });
    expect(tag).toBe('<channel source="w" ok_1="3">\nx\n</channel>');
  });
  test('an event with no meta has only the source', () => {
    expect(channelTag('w', { content: 'x' })).toBe('<channel source="w">\nx\n</channel>');
  });
  test('events that arrive together are delivered as a group, in order', () => {
    expect(groupChannelEvents(['a', 'b'])).toBe('a\nb');
    expect(groupChannelEvents([])).toBeUndefined();
  });
  test('events are dropped unless the session registered the server and policy admits it', () => {
    expect(deliversChannelEvents(undefined)).toBe(false);
    const blocked = channelVerdict(channelGate(viewOf(), team), allowlist, {
      origin: 'channels',
      plugin: official,
    });
    expect(deliversChannelEvents(blocked)).toBe(false);
  });
});

spec('channels.reference.Expose a reply tool', () => {
  test('a reply tool needs the tools capability, discovered by the host', () => {
    const caps = channelCapabilities({ experimental: { 'claude/channel': {} }, tools: {} });
    expect(caps.tools).toBe(true);
    expect(channelCapabilities({ experimental: { 'claude/channel': {} }, tools: 'x' }).tools).toBe(
      false,
    );
  });
});

spec('channels.reference.Gate inbound messages', () => {
  const allowed = new Set(['u1']);
  test('the sender is checked, not the room', () => {
    expect(senderAllowed(allowed, { from: { id: 'u1' }, chat: { id: 'room' } })).toBe(true);
    expect(senderAllowed(allowed, { from: { id: 'u2' }, chat: { id: 'u1' } })).toBe(false);
  });
});

spec(['channels.overview.Security'], () => {
  test('being in .mcp.json is not enough: the server must be named by a flag and admitted', () => {
    expect(deliversChannelEvents(undefined)).toBe(false);
    const entry: ChannelEntry = { origin: 'channels', plugin: official };
    expect(deliversChannelEvents(channelVerdict(gate, allowlist, entry))).toBe(true);
  });
  test('a sender that is not on the allowlist is silently dropped', () => {
    expect(senderAllowed(new Set(), { from: { id: 'x' }, chat: { id: 'x' } })).toBe(false);
  });
});

spec(['channels.reference.Package as a plugin', 'channels.components.Channels'], () => {
  test('a plugin channel enabled with --channels runs only when on the allowlist', () => {
    const listed: ChannelEntry = { origin: 'channels', plugin: official };
    const mine: ChannelEntry = {
      origin: 'channels',
      plugin: { plugin: 'mine', marketplace: 'my-marketplace' },
    };
    expect(channelVerdict(gate, allowlist, listed).allowed).toBe(true);
    expect(channelVerdict(gate, allowlist, mine)).toEqual({
      allowed: false,
      reason: 'notOnDefaultList',
    });
  });
  test('the development flag runs a channel that is not on the allowlist', () => {
    const dev: ChannelEntry = {
      origin: 'development',
      interactive: true,
      plugin: { plugin: 'mine', marketplace: 'my-marketplace' },
    };
    expect(channelVerdict(gate, allowlist, dev).allowed).toBe(true);
  });
});
