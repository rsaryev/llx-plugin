import type { ChannelPluginRef } from '../../protocol/official.ts';
import type { ChannelEntry } from '../../settings/channels/verdict.ts';
import { refuse, type Contribution, type FlagContext, type SessionChannel } from './types.ts';

/**
 * `--channels` and `--dangerously-load-development-channels` (cli-reference.md, "CLI flags";
 * channels.md, "Enterprise controls"; channels-reference.md, "Test during the research preview").
 * `--channels` takes a "space-separated list of `plugin:<name>@<marketplace>` entries"; the
 * development flag "accepts `plugin:<name>@<marketplace>` and `server:<name>` entries", prompts for
 * confirmation, "so it takes effect in interactive sessions", and with `-p` Claude Code "ignores the
 * flag". The kit builds the entries `channelVerdict` reads; the verdict is that module's. The wording
 * of an entry that is neither form is in spec/judgments.md.
 */

const WHITESPACE = /\s+/;
const PLUGIN_ENTRY = /^plugin:([^@\s]+)@(\S+)$/;
const SERVER_ENTRY = /^server:(\S+)$/;

const entriesOf = (values: readonly string[]): readonly string[] =>
  values.flatMap((value) => value.split(WHITESPACE).filter((entry) => entry !== ''));

const pluginRef = (raw: string): ChannelPluginRef | undefined => {
  const parts = PLUGIN_ENTRY.exec(raw);
  const plugin = parts?.[1];
  const marketplace = parts?.[2];
  return plugin === undefined || marketplace === undefined ? undefined : { plugin, marketplace };
};

const serverName = (raw: string): string | undefined => SERVER_ENTRY.exec(raw)?.[1];

type ChannelOf = (raw: string, interactive: boolean) => SessionChannel | undefined;

/** `--channels` entries name plugins only: they face the allowlist. */
const channelsEntry: ChannelOf = (raw) => {
  const plugin = pluginRef(raw);
  return plugin === undefined ? undefined : { raw, entry: { origin: 'channels', plugin } };
};

/** A development entry is a plugin or a server; either skips the allowlist for itself only. */
const developmentEntry: ChannelOf = (raw, interactive) => {
  const plugin = pluginRef(raw);
  const server = serverName(raw);
  if (plugin === undefined && server === undefined) return undefined;
  const entry: ChannelEntry = {
    origin: 'development',
    interactive,
    ...(plugin === undefined ? {} : { plugin }),
  };
  return { raw, entry, ...(server === undefined ? {} : { server }) };
};

function channelsFrom(
  values: readonly string[],
  build: ChannelOf,
  expected: string,
  interactive: boolean,
): Contribution {
  const raws = entriesOf(values);
  const built = raws.map((raw) => ({ raw, channel: build(raw, interactive) }));
  const bad = built.filter((one) => one.channel === undefined).map((one) => one.raw);
  if (bad.length > 0)
    return refuse(...bad.map((raw) => `Invalid channel entry "${raw}": expected ${expected}`));
  return { channels: built.flatMap((one) => (one.channel === undefined ? [] : [one.channel])) };
}

export const channels = (values: readonly string[]): Contribution =>
  channelsFrom(values, channelsEntry, 'plugin:<name>@<marketplace>', true);

export const developmentChannels = (
  values: readonly string[],
  context: FlagContext,
): Contribution =>
  channelsFrom(
    values,
    developmentEntry,
    'plugin:<name>@<marketplace> or server:<name>',
    !context.facts.print,
  );
