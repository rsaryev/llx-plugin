/**
 * cli-reference.md § CLI flags (`--channels`: a space-separated list of `plugin:<name>@<marketplace>`
 * entries; `--dangerously-load-development-channels`: `plugin:<name>@<marketplace>` and `server:<name>`
 * entries, takes effect in interactive sessions, ignored with `-p`; `--mcp-config`: JSON files or
 * strings, with `-p` waits for pending servers up to `MCP_TIMEOUT`, 30 seconds by default;
 * `--strict-mcp-config`: only the servers of `--mcp-config`), channels.md and channels-reference.md §
 * Test during the research preview (the allowlist, and the development flag's bypass per entry),
 * headless.md § Start faster with bare mode (only servers supplied on the command line connect).
 * The verdict on a channel is `channelVerdict`'s, the loading of a server the MCP stream's; these
 * tests prove the flag-to-input mapping, end to end through the verdict where the docs describe the
 * outcome. The wording of an entry that is neither form is outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_MCP_TIMEOUT_MS, mcpSourcesRead } from '../../src/cli/flags/mcp.ts';
import type { SessionChannel } from '../../src/cli/flags/types.ts';
import {
  channelVerdict,
  type ChannelAllowlist,
  type ChannelGate,
} from '../../src/settings/channels/index.ts';
import { planOf, printFacts } from '../support/session-flags.ts';
import { spec } from '../support/spec.ts';

const OPEN: ChannelGate = {
  open: true,
  by: 'consoleDefault',
  startupWarning: undefined,
  serverConnects: true,
};
const CLOSED: ChannelGate = {
  open: false,
  by: undefined,
  startupWarning: 'adminMustEnable',
  serverConnects: true,
};
const listed = (...entries: [string, string][]): ChannelAllowlist => ({
  source: 'default',
  entries: entries.map(([plugin, marketplace]) => ({ plugin, marketplace })),
});

const only = (channels: readonly SessionChannel[]): SessionChannel => {
  const [first] = channels;
  if (first === undefined || channels.length !== 1) throw new Error('expected one channel');
  return first;
};

spec('cli.flag.--channels', () => {
  test('a plugin:<name>@<marketplace> entry becomes a channel entry that faces the allowlist', () => {
    const channel = only(planOf({ '--channels': ['plugin:my-notifier@my-marketplace'] }).channels);
    expect(channel.entry).toEqual({
      origin: 'channels',
      plugin: { plugin: 'my-notifier', marketplace: 'my-marketplace' },
    });
    expect(
      channelVerdict(OPEN, listed(['my-notifier', 'my-marketplace']), channel.entry).allowed,
    ).toBe(true);
    expect(channelVerdict(OPEN, listed(), channel.entry)).toEqual({
      allowed: false,
      reason: 'notOnDefaultList',
    });
  });

  test('the list is space-separated, in one value or several', () => {
    const plan = planOf({ '--channels': ['plugin:a@m plugin:b@m', 'plugin:c@n'] });
    expect(plan.channels.map((channel) => channel.raw)).toEqual([
      'plugin:a@m',
      'plugin:b@m',
      'plugin:c@n',
    ]);
  });

  test('a closed gate blocks every entry', () => {
    const channel = only(planOf({ '--channels': ['plugin:a@m'] }).channels);
    expect(channelVerdict(CLOSED, listed(['a', 'm']), channel.entry).reason).toBe(
      'channelsNotEnabled',
    );
  });

  test('an entry that is not plugin:<name>@<marketplace> fails the run, and a server: entry is not one', () => {
    for (const bad of ['my-notifier', 'plugin:no-marketplace', 'server:webhook']) {
      const plan = planOf({ '--channels': [bad] });
      expect(plan.refusals).toHaveLength(1);
      expect(plan.refusals[0]).toContain(bad);
      expect(plan.channels).toEqual([]);
    }
  });
});

const dev = (...values: string[]) => planOf({ '--dangerously-load-development-channels': values });

spec('cli.flag.--dangerously-load-development-channels', () => {
  test('accepts plugin:<name>@<marketplace> and server:<name> entries', () => {
    const plan = dev('plugin:a@m', 'server:webhook');
    expect(plan.refusals).toEqual([]);
    expect(plan.channels.map((channel) => channel.server)).toEqual([undefined, 'webhook']);
    expect(plan.channels[0]?.entry).toMatchObject({
      origin: 'development',
      plugin: { plugin: 'a', marketplace: 'm' },
    });
    expect(plan.channels[1]?.entry).toEqual({ origin: 'development', interactive: true });
  });

  test('skips the allowlist for its own entries: an unlisted entry is allowed in an interactive session', () => {
    const channel = only(dev('plugin:a@m').channels);
    expect(channelVerdict(OPEN, listed(), channel.entry)).toEqual({
      allowed: true,
      reason: 'developmentFlag',
    });
  });

  test('does not extend the bypass to --channels entries', () => {
    const plan = planOf({
      '--channels': ['plugin:a@m'],
      '--dangerously-load-development-channels': ['plugin:b@m'],
    });
    const verdicts = plan.channels.map(
      (channel) => channelVerdict(OPEN, listed(), channel.entry).allowed,
    );
    expect(verdicts).toEqual([false, true]);
  });

  test('takes effect in interactive sessions only: with -p the flag is ignored and the channel does not register', () => {
    const plan = planOf(
      { '--dangerously-load-development-channels': ['server:webhook'] },
      printFacts(),
    );
    expect(only(plan.channels).entry).toEqual({ origin: 'development', interactive: false });
    expect(channelVerdict(OPEN, listed(), only(plan.channels).entry)).toEqual({
      allowed: false,
      reason: 'developmentFlagNeedsInteractive',
    });
  });

  test('a closed gate blocks the development flag too', () => {
    const channel = only(dev('server:webhook').channels);
    expect(channelVerdict(CLOSED, listed(), channel.entry).reason).toBe('channelsNotEnabled');
  });

  test('an entry that is neither form fails the run', () => {
    expect(dev('webhook').refusals[0]).toContain('server:<name>');
  });
});

describe('--mcp-config', () => {
  const inline = '{"mcpServers":{"a":{"type":"http","url":"https://x"}}}';

  spec('cli.flag.--mcp-config', () => {
    test('loads servers from JSON files or strings, in the order given', () => {
      const plan = planOf({ '--mcp-config': ['./mcp.json', inline] });
      expect(plan.mcpConfigs).toEqual([
        { kind: 'file', path: './mcp.json' },
        { kind: 'inline', text: inline },
      ]);
    });

    test('a value holds several files, space-separated; inline JSON stays whole', () => {
      const plan = planOf({ '--mcp-config': ['./a.json  ./b.json', inline, './c.json'] });
      expect(plan.mcpConfigs).toEqual([
        { kind: 'file', path: './a.json' },
        { kind: 'file', path: './b.json' },
        { kind: 'inline', text: inline },
        { kind: 'file', path: './c.json' },
      ]);
      const spaced = '{"mcpServers":{"a b":{"type":"http","url":"https://x"}}}';
      expect(planOf({ '--mcp-config': [spaced] }).mcpConfigs).toEqual([
        { kind: 'inline', text: spaced },
      ]);
    });

    test('with -p it waits for still-pending servers for 30 seconds by default', () => {
      expect(planOf({ '--mcp-config': ['./mcp.json'] }, printFacts()).mcpWaitMs).toBe(30_000);
      expect(DEFAULT_MCP_TIMEOUT_MS).toBe(30_000);
    });

    test('the wait is the MCP_TIMEOUT startup timeout when it is set', () => {
      const plan = planOf(
        { '--mcp-config': ['./mcp.json'] },
        printFacts({ env: { MCP_TIMEOUT: '5000' } }),
      );
      expect(plan.mcpWaitMs).toBe(5000);
    });

    test('without -p there is no wait, and an unusable MCP_TIMEOUT is the default', () => {
      expect(planOf({ '--mcp-config': ['./mcp.json'] }).mcpWaitMs).toBeUndefined();
      const odd = planOf(
        { '--mcp-config': ['./m.json'] },
        printFacts({ env: { MCP_TIMEOUT: 'soon' } }),
      );
      expect(odd.mcpWaitMs).toBe(30_000);
    });

    test('without the flag there is nothing to load or wait for', () => {
      const plan = planOf({}, printFacts());
      expect(plan.mcpConfigs).toEqual([]);
      expect(plan.mcpWaitMs).toBeUndefined();
    });
  });

  spec('cli.flag.--strict-mcp-config', () => {
    test('uses only the servers from --mcp-config, ignoring every other MCP configuration', () => {
      const plan = planOf({ '--strict-mcp-config': true, '--mcp-config': ['./mcp.json'] });
      expect(plan.strictMcpConfig).toBe(true);
      expect(mcpSourcesRead(plan)).toEqual(['command-line']);
    });

    test('without the flag every source is read', () => {
      expect(mcpSourcesRead(planOf({ '--mcp-config': ['./mcp.json'] }))).toEqual([
        'user',
        'project',
        'local',
        'plugins',
        'command-line',
      ]);
    });

    test('--bare also leaves only the command line: "only servers supplied on the command line connect"', () => {
      expect(mcpSourcesRead(planOf({ '--bare': true }))).toEqual(['command-line']);
    });
  });
});
