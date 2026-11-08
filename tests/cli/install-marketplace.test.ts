/**
 * plugins/cli-reference.md § plugin install (`--marketplace <source>`: "Install `<plugin>`, given by
 * its bare name, from the marketplace at `<source>`, adding the marketplace first if you haven't added
 * it yet"); plugins/install.md § Add and install from your shell ("declared in your user settings even
 * when you pass `--scope project`", "A marketplace you've already added from that source is reused",
 * "A new one is added under the same organization policy checks as `claude plugin marketplace add`",
 * `Successfully added marketplace: <name> (declared in user settings)`). The refusal of a name, its
 * `invalid_name` code and the wording are outside `spec(...)` and in spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import { startInstall } from '../../src/cli/install-start.ts';
import { contextOf, effectsOf, lastJson, printed, run, type Setup } from '../support/install.ts';
import { spec } from '../support/spec.ts';

spec('cli.plugin.plugin install.--marketplace <source>', () => {
  const added = { name: 'deploy-market', alreadyKnown: false, registered: [] };
  const marketSetup = (extra: Setup = {}): Setup => ({
    ...extra,
    args: { plugin: 'deploy-helper', marketplace: 'your-org/plugins', ...extra.args },
    catalog: [
      ['deploy-helper@deploy-market', { ...plugin0('deploy-helper', 'deploy-market') }],
      ['deploy-helper@other', { ...plugin0('deploy-helper', 'other') }],
    ],
    found: { addedMarketplace: added, ...extra.found },
  });

  test('says the marketplace is added first, to the user settings, then installs the plugin', async () => {
    const found = await run(marketSetup());
    expect(printed(found).stdout).toEqual([
      'Successfully added marketplace: deploy-market (declared in user settings)',
      'Successfully installed plugin: deploy-helper@deploy-market (scope: user)',
    ]);
  });

  test('the plan adds the marketplace source to the user settings even with --scope project', () => {
    const begun = startInstall(
      { plugin: 'deploy-helper', marketplace: 'your-org/plugins', scope: 'project' },
      contextOf(),
    );
    expect(begun).toMatchObject({
      kind: 'prepare',
      pending: {
        scope: 'project',
        addMarketplace: {
          scope: 'user',
          source: { kind: 'github', repo: 'your-org/plugins' },
        },
      },
    });
  });

  test('a marketplace already added from that source is reused: no add line', async () => {
    const found = await run(
      marketSetup({
        found: { addedMarketplace: { name: 'deploy-market', alreadyKnown: true, registered: [] } },
      }),
    );
    expect(printed(found).stdout).toEqual([
      'Successfully installed plugin: deploy-helper@deploy-market (scope: user)',
    ]);
  });

  test('looks the bare name up in that marketplace only', async () => {
    const found = await run(marketSetup());
    expect(effectsOf(found)?.id).toBe('deploy-helper@deploy-market');
  });

  test('wants the plugin name by itself, without @marketplace', () => {
    const begun = startInstall(
      { plugin: 'deploy-helper@m', marketplace: 'your-org/plugins' },
      contextOf(),
    );
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'usage-error' } });
  });

  test.each([
    ['a reserved name outside github.com/anthropics', 'claude-plugins-official'],
    ['a name that impersonates an official marketplace', 'official-claude-plugins'],
    ['a name that starts claudeai-', 'claudeai-tools'],
  ])(
    '%s refuses the install with invalid_name, like marketplace add, and installs nothing',
    async (_what, name) => {
      const found = await run(
        marketSetup({ found: { addedMarketplace: { name, alreadyKnown: false, registered: [] } } }),
      );
      expect(printed(found).exitCode).toBe(1);
      expect(printed(found).stdout).toEqual([]);
      expect(lastJson(found)['failureCode']).toBe('invalid_name');
      expect(effectsOf(found)).toBeUndefined();
    },
  );

  test('a name that is the download folder of a registered github marketplace is refused', async () => {
    const registered = [
      { name: 'x', source: { kind: 'github' as const, repo: 'acme/x-tools', path: 'f' } },
    ];
    const found = await run(
      marketSetup({
        found: { addedMarketplace: { name: 'acme-x-tools', alreadyKnown: false, registered } },
      }),
    );
    expect(lastJson(found)['failureCode']).toBe('invalid_name');
  });

  test('a marketplace that was already added is not checked again', async () => {
    const found = await run(
      marketSetup({
        found: {
          addedMarketplace: { name: 'deploy-market', alreadyKnown: true, registered: [] },
        },
      }),
    );
    expect(lastJson(found)['failureCode']).toBeUndefined();
  });

  test('a source that is none of the forms ends the command with a failed result', () => {
    const begun = startInstall({ plugin: 'x', marketplace: 'not a source' }, contextOf());
    expect(begun).toMatchObject({ kind: 'done', output: { kind: 'result' } });
  });
});

function plugin0(name: string, marketplace: string) {
  return {
    name,
    marketplace,
    source: { kind: 'github' as const, repo: `acme/${name}` },
    dependencies: [],
  };
}
