/**
 * plugins/cli-reference.md § plugin install (`--accept-command <sha256>`: "Accept the displayed
 * install command whose `sha256` a previous `--json` run reported in `shownCommand`, in place of `-y`.
 * Can't be combined with `-y`") and § Accept a displayed install command: "When a `--json` run
 * displays a marketplace-declared command and doesn't run it, the `failed` result also carries a
 * `shownCommand` object. Its fields include the command as displayed, the plugin it belongs to, and
 * the command's `sha256`. To accept exactly that command, re-run with that `sha256` as
 * `--accept-command` from your own terminal, because the flag has no effect inside a Claude Code
 * session. The `sha256` counts as acceptance for exactly that command, plugin, and marketplace
 * catalog. If any of them changed since the command was displayed, Claude Code doesn't accept the
 * `sha256` and shows the command again. A change that the run's own marketplace refresh fetches also
 * counts as such a change. If `shownCommand.acceptCommandMatched` is `false`, the `sha256` you passed
 * doesn't match the command now displayed"; plugins/host-marketplace.md § How users accept a
 * headersHelper command. What the digest is built from is a judgment (spec/judgments.md).
 */
import { describe, expect, test } from 'bun:test';
import { startInstall } from '../../src/cli/install-start.ts';
import {
  COMMAND_ENTRY,
  HEADERS_ENTRY,
  contextOf,
  lastJson,
  printed,
  run,
  shownCommandOf,
  type Setup,
} from '../support/install.ts';
import { spec } from '../support/spec.ts';

const setup = (extra: Setup = {}): Setup => ({
  args: { plugin: 'hooked@m', json: true, ...extra.args },
  catalog: [['hooked@m', COMMAND_ENTRY]],
  ...(extra.found === undefined ? {} : { found: extra.found }),
  ...(extra.context === undefined ? {} : { context: extra.context }),
});

/** The digest a first `--json` run displays. */
async function shown(extra: Setup = {}): Promise<string> {
  return shownCommandOf(await run(setup(extra))).sha256;
}

spec('cli.plugin.Accept a displayed install command', () => {
  test('the failed result carries shownCommand with the command, the plugin and the sha256', async () => {
    const result = lastJson(await run(setup()));
    expect(result).toMatchObject({ outcome: 'failed' });
    expect(result['shownCommand']).toEqual({
      command: 'node build.js',
      plugin: 'hooked@m',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test('re-running with that sha256 as --accept-command installs exactly that command', async () => {
    const sha256 = await shown();
    const found = await run(setup({ args: { acceptCommand: sha256 } }));
    expect(printed(found, true).exitCode).toBe(0);
    expect(lastJson(found)).toMatchObject({ outcome: 'ok', pluginId: 'hooked@m' });
  });

  test('a command that changed since it was displayed is not accepted and is shown again', async () => {
    const sha256 = await shown();
    const changed = {
      ...COMMAND_ENTRY,
      source: { ...COMMAND_ENTRY.source, command: 'node evil.js' },
    };
    const found = await run({
      args: { plugin: 'hooked@m', json: true, acceptCommand: sha256 },
      catalog: [['hooked@m', changed]],
    });
    expect(shownCommandOf(found)).toMatchObject({
      command: 'node evil.js',
      acceptCommandMatched: false,
    });
  });

  test('the same command under another plugin is not accepted', async () => {
    const sha256 = await shown();
    const found = await run({
      args: { plugin: 'other@m', json: true, acceptCommand: sha256 },
      catalog: [['other@m', COMMAND_ENTRY]],
    });
    expect(lastJson(found)).toMatchObject({ outcome: 'failed' });
    expect(shownCommandOf(found)).toMatchObject({
      command: 'node build.js',
      plugin: 'other@m',
      acceptCommandMatched: false,
    });
    expect(shownCommandOf(found).sha256).not.toBe(sha256);
  });

  test('a marketplace catalog that changed since is not accepted', async () => {
    const sha256 = await shown();
    const found = await run(
      setup({ args: { acceptCommand: sha256 }, found: { catalog: 'catalog-v2' } }),
    );
    expect(lastJson(found)['shownCommand']).toMatchObject({ acceptCommandMatched: false });
  });

  test("a change the run's own refresh fetched counts as a change", async () => {
    const refreshing = {
      marketplaces: [{ name: 'm', source: 'github' as const, autoUpdate: false }],
    };
    const stale = await run(
      setup({
        found: { catalog: 'cached-before-the-refresh', refreshFailed: true },
        context: refreshing,
      }),
    );
    expect(printed(stale).stdout).toContain('marketplace not refreshed');
    const sha256 = shownCommandOf(stale).sha256;
    const refreshed = await run(
      setup({
        args: { acceptCommand: sha256 },
        found: { catalog: 'fetched-by-the-refresh' },
        context: refreshing,
      }),
    );
    expect(printed(refreshed).stdout).not.toContain('marketplace not refreshed');
    expect(lastJson(refreshed)).toMatchObject({ outcome: 'failed' });
    expect(shownCommandOf(refreshed)).toMatchObject({ acceptCommandMatched: false });
  });

  test('acceptCommandMatched is absent when no --accept-command was passed', async () => {
    const result = lastJson(await run(setup()));
    expect(result['shownCommand']).not.toHaveProperty('acceptCommandMatched');
  });

  test('the flag has no effect inside a Claude Code session', async () => {
    const sha256 = await shown();
    const found = await run(setup({ args: { acceptCommand: sha256 }, context: { session: true } }));
    expect(lastJson(found)).toMatchObject({ outcome: 'failed' });
  });
});

spec(
  [
    'cli.plugin.plugin install.--accept-command <sha256>',
    'marketplace.hosting.How users accept a headersHelper command.Shell',
  ],
  () => {
    test('is accepted in place of -y for a headersHelper entry too', async () => {
      const first = await run({
        args: { plugin: 'helped@m', json: true },
        catalog: [['helped@m', HEADERS_ENTRY]],
      });
      const sha256 = shownCommandOf(first).sha256;
      const second = await run({
        args: { plugin: 'helped@m', json: true, acceptCommand: sha256 },
        catalog: [['helped@m', HEADERS_ENTRY]],
      });
      expect(lastJson(second)).toMatchObject({ outcome: 'ok' });
    });

    test('a sha256 that matches nothing is refused with acceptCommandMatched false', async () => {
      const found = await run(setup({ args: { acceptCommand: 'f'.repeat(64) } }));
      expect(lastJson(found)['shownCommand']).toMatchObject({ acceptCommandMatched: false });
      expect(printed(found).exitCode).toBe(1);
    });

    test('cannot be combined with -y: a usage error that prints no result line', () => {
      const begun = startInstall(
        { plugin: 'formatter@m', yes: true, acceptCommand: 'a'.repeat(64), json: true },
        contextOf(),
      );
      expect(begun).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
    });
  },
);

describe('the digest', () => {
  test('is the same for the same command, plugin and catalog', async () => {
    expect(await shown()).toBe(await shown());
  });
});

describe('a digest that does not match at a terminal (judgment)', () => {
  test('is shown again without a question: the flag is for scripts', async () => {
    const found = await run(
      setup({ args: { acceptCommand: 'f'.repeat(64) }, context: { tty: true } }),
    );
    expect('prompt' in found).toBe(false);
    expect(printed(found).exitCode).toBe(1);
  });
});
