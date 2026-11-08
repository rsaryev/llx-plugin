/**
 * plugins/cli-reference.md § plugin install (`--config <key=value>`: "Set a `userConfig` option the
 * plugin's manifest declares. Repeat the flag for each option. A key written `<server>.<key>` sets a
 * setting that a bundled MCP server declares in its own `user_config` instead"; `--marketplace
 * <source>`: "Install `<plugin>`, given by its bare name, from the marketplace at `<source>`, adding the
 * marketplace first if you haven't added it yet"); plugins/install.md § Add and install from your
 * shell ("declared in your user settings even when you pass `--scope project`", "A marketplace you've
 * already added from that source is reused", `Successfully added marketplace: <name> (declared in user
 * settings)`); plugins/troubleshooting.md § The `userConfig` dialog never appears (`N userConfig
 * options not yet set ... (M required)`, `⚠ Installed, but --config not applied: ...`);
 * plugins/loading.md § When Claude Code refreshes a marketplace before an install (the refresh before
 * the lookup, `marketplace not refreshed`, the managed block). A value that fails validation refusing
 * the install and the wording after the quoted parts are outside `spec(...)` and in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { startInstall } from '../../src/cli/install-start.ts';
import type { UserConfigOption } from '../../src/format/index.ts';
import { fakeEnvironment } from '../support/ports.ts';
import { contextOf, effectsOf, printed, run, type Setup } from '../support/install.ts';
import { spec } from '../support/spec.ts';

const option = (extra: Partial<UserConfigOption> = {}): UserConfigOption => ({
  type: 'string',
  title: 'T',
  description: 'D',
  ...extra,
});

const declared = {
  api_url: option({ required: true }),
  api_token: option({ sensitive: true }),
  retries: option({ type: 'number', max: 5 }),
};

const withConfig = (config: readonly string[], extra: Setup = {}): Setup => ({
  ...extra,
  args: { config, ...extra.args },
  found: { options: { declared }, ...extra.found },
});

spec('cli.plugin.plugin install.--config <key=value>', () => {
  test('sets the options the manifest declares, converted to their types', async () => {
    const found = await run(withConfig(['api_url=https://example.com', 'retries=3']));
    expect(effectsOf(found)?.config).toEqual({
      settings: { api_url: 'https://example.com', retries: 3 },
      secrets: {},
    });
  });

  test('a sensitive option goes to the secrets, never the settings', async () => {
    const found = await run(withConfig(['api_token=sk-1']));
    expect(effectsOf(found)?.config).toEqual({ settings: {}, secrets: { api_token: 'sk-1' } });
  });

  test('repeats for each option, and a key given twice keeps its last value', async () => {
    const found = await run(withConfig(['retries=1', 'api_url=a', 'retries=4']));
    expect(effectsOf(found)?.config.settings).toEqual({ retries: 4, api_url: 'a' });
  });

  test('a key written <server>.<key> sets what a bundled MCP server declares', async () => {
    const found = await run(
      withConfig(['files.root=/srv'], {
        found: { options: { declared, bundledServers: { files: { root: option() } } } },
      }),
    );
    expect(effectsOf(found)?.servers).toEqual({ files: { root: '/srv' } });
    expect(effectsOf(found)?.config).toEqual({ settings: {}, secrets: {} });
  });

  test('a key the manifest does not declare still installs and says it was not applied, listing the declared keys', async () => {
    const found = await run(withConfig(['nope=1']));
    expect(printed(found).exitCode).toBe(0);
    const lines = printed(found).stdout.join('\n');
    expect(lines).toContain(
      '⚠ Installed, but --config not applied: --config key "nope" isn\'t declared in this plugin\'s userConfig.',
    );
    expect(lines).toContain('api_url, api_token, retries');
  });

  test('for a plugin with a bundled server the message says so and the known keys include <server>.<key>', async () => {
    const found = await run(
      withConfig(['nope=1'], {
        found: { options: { declared, bundledServers: { files: { root: option() } } } },
      }),
    );
    const lines = printed(found).stdout.join('\n');
    expect(lines).toContain(
      "isn't declared in this plugin's userConfig or by its bundled MCP servers.",
    );
    expect(lines).toContain('files.root');
  });

  test('a bundled server whose bundle is referenced by URL is not read: its keys are not known and the message says to configure it in /plugin', async () => {
    const found = await run(
      withConfig(['remote.root=/srv'], {
        found: { options: { declared, unreadServers: ['remote'] } },
      }),
    );
    expect(effectsOf(found)?.servers).toEqual({});
    const lines = printed(found).stdout.join('\n');
    expect(lines).toContain(
      "isn't declared in this plugin's userConfig or by its bundled MCP servers.",
    );
    expect(lines).toContain('Declared keys: api_url, api_token, retries.');
    expect(lines).toContain('Configure "remote" in /plugin');
    expect(lines).not.toContain('remote.root,');
  });

  test('a value that fails its declared type or bound refuses the install and installs nothing', async () => {
    const found = await run(withConfig(['retries=9']));
    expect(printed(found).exitCode).toBe(1);
    expect(printed(found).stderr.join('\n')).toContain('retries');
    expect(effectsOf(found)).toBeUndefined();
  });

  test('options left unset print how many are not yet set and how many are required', async () => {
    const found = await run(withConfig([]));
    expect(printed(found).stdout.join('\n')).toEndWith(
      '3 userConfig options not yet set (1 required) — run /plugin configure formatter@m in Claude Code, or pass --config KEY=VALUE.',
    );
  });

  test('the (M required) part is left out when no unset option is required', async () => {
    const found = await run(withConfig(['api_url=a']));
    expect(printed(found).stdout.join('\n')).toEndWith(
      '2 userConfig options not yet set — run /plugin configure formatter@m in Claude Code, or pass --config KEY=VALUE.',
    );
  });

  test('when every option is set the output carries no not-yet-set line', async () => {
    const found = await run(withConfig(['api_url=a', 'api_token=t', 'retries=1']));
    expect(printed(found).stdout.join('\n')).not.toContain('not yet set');
  });

  test('a flag with no = is a usage error', () => {
    const begun = startInstall({ plugin: 'formatter@m', config: ['api_url'] }, contextOf());
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });
});

const ctx = (marketplaces: Parameters<typeof contextOf>[0] = {}) => contextOf(marketplaces);
const known = (extra = {}) => ({
  name: 'm',
  source: 'github' as const,
  autoUpdate: false,
  ...extra,
});

describe('the refresh before the install', () => {
  test('a qualified name refreshes the marketplace it names before the lookup', () => {
    const begun = startInstall({ plugin: 'formatter@m' }, ctx({ marketplaces: [known()] }));
    expect(begun).toMatchObject({ kind: 'prepare', pending: { refresh: { marketplaces: ['m'] } } });
  });

  test('a bare name reads the cached catalogs without refreshing', () => {
    const begun = startInstall(
      { plugin: 'formatter' },
      ctx({ marketplaces: [known({ autoUpdate: true })] }),
    );
    expect(begun).toMatchObject({
      kind: 'prepare',
      pending: { refresh: { reason: 'cli-reads-cached-catalogs' } },
    });
  });

  test('a marketplace refreshed within 30 seconds is not refreshed again', () => {
    const begun = startInstall(
      { plugin: 'formatter@m' },
      ctx({ marketplaces: [known({ lastRefreshedAt: 999_000 })] }),
    );
    expect(begun).toMatchObject({
      pending: { refresh: { reason: 'refreshed-within-30-seconds' } },
    });
  });

  test('DISABLE_NONESSENTIAL_TRAFFIC skips the refresh', () => {
    const begun = startInstall(
      { plugin: 'formatter@m' },
      ctx({
        marketplaces: [known()],
        env: fakeEnvironment({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }),
      }),
    );
    expect(begun).toMatchObject({
      pending: { refresh: { reason: 'nonessential-traffic-disabled' } },
    });
  });

  test('a marketplace managed settings block also refuses the install', () => {
    const begun = startInstall(
      { plugin: 'formatter@m' },
      ctx({ marketplaces: [known({ blocked: 'Marketplace m is blocked by enterprise policy' })] }),
    );
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'result' } });
    expect(JSON.stringify(begun)).toContain('blocked by enterprise policy');
  });

  test('a refresh that failed installs from the cached catalog and reports marketplace not refreshed', async () => {
    const found = await run({ found: { refreshFailed: true } });
    expect(printed(found).stdout).toEqual([
      'marketplace not refreshed',
      'Successfully installed plugin: formatter@m (scope: user)',
    ]);
  });

  test('a marketplace added by --marketplace has just been fetched: no refresh follows', () => {
    const begun = startInstall(
      { plugin: 'x', marketplace: 'your-org/plugins' },
      ctx({ marketplaces: [known()] }),
    );
    expect(begun).toMatchObject({ pending: { refresh: { outcome: 'skip' } } });
  });
});
