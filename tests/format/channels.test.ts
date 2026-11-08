/**
 * plugins/manifest-reference.md § Channels and § Unrecognized fields: each `channels` entry is a
 * strict object bound to one of the plugin's MCP servers; an unknown key fails, and the plugin does
 * not load.
 */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const withChannels = (channels: unknown) => readManifest({ name: 'demo', channels });
const token = {
  type: 'string',
  title: 'Bot token',
  description: 'Token',
  sensitive: true,
} as const;

spec(['manifest.field.channels', 'channels.field.server'], () => {
  test('an entry names the MCP server it binds to', () => {
    expect(withChannels([{ server: 'telegram' }]).manifest?.channels).toEqual([
      { server: 'telegram' },
    ]);
  });
  test('an entry without a server fails', () => {
    expect(withChannels([{ displayName: 'Telegram' }]).manifest).toBeUndefined();
  });
});

spec('channels.field.displayName', () => {
  test('is optional and kept', () => {
    const channel = { server: 'telegram', displayName: 'Telegram' };
    expect(withChannels([channel]).manifest?.channels).toEqual([channel]);
  });
});

spec('channels.field.userConfig', () => {
  test('takes options in the shape of the top-level userConfig', () => {
    const channel = { server: 'telegram', userConfig: { bot_token: token } };
    expect(withChannels([channel]).manifest?.channels).toEqual([channel]);
  });
  test('an option of another shape fails', () => {
    const channel = { server: 'telegram', userConfig: { bot_token: { ...token, secret: 1 } } };
    expect(withChannels([channel]).manifest).toBeUndefined();
  });
});

test('an unknown key in an entry fails, and the plugin does not load', () => {
  expect(withChannels([{ server: 'telegram', colour: 'blue' }]).manifest).toBeUndefined();
});
