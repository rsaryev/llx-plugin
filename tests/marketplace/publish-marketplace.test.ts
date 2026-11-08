/**
 * plugins/publish.md § Prepare your plugin for release, § Add the marketplace file to your repository,
 * § Control who can install, § Ship a plugin with your own tool; plugins/troubleshooting.md § Marketplace
 * add fails on a GitHub Enterprise Server host (the policy-error half: an admin adds a `hostPattern`).
 */
import { expect, test } from 'bun:test';
import { validatePlugin } from '../../src/index.ts';
import { planInstallCommand } from '../../src/marketplace/install-commands.ts';
import { parseMarketplaceInput } from '../../src/marketplace/marketplace-input.ts';
import { upToDateMessage } from '../../src/marketplace/update-detection.ts';
import { admits, git, hostPattern } from '../support/marketplace-sources.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const P = 'marketplace.publish.';
const MARKET = '.claude-plugin/marketplace.json';
const PLUGIN = '.claude-plugin/plugin.json';
const issues = async (tree: Parameters<typeof memoryFiles>[0]) =>
  (await validatePlugin({ files: memoryFiles(tree) })).issues;

const file = JSON.stringify({
  name: 'your-marketplace',
  owner: { name: 'Your Name' },
  plugins: [{ name: 'deploy-helper', source: './' }],
});
const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'deploy-helper',
    description: 'Deploys',
    author: { name: 'You' },
    version: '1.0.0',
    ...extra,
  });

spec(`${P}Add the marketplace file to your repository`, () => {
  test('the documented file, with one entry whose source is "./" beside plugin.json, has no errors', async () => {
    const found = await issues({ [MARKET]: file, [PLUGIN]: manifest() });
    expect(found.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
  test('the entry name must match the plugin.json name', async () => {
    const found = await issues({ [MARKET]: file, [PLUGIN]: manifest({ name: 'other-name' }) });
    expect(found.length).toBeGreaterThan(0);
  });
});

spec(`${P}Control who can install`, () => {
  test('whoever can clone the repository can install: a repository address is a git source, nothing more is recorded', () => {
    expect(parseMarketplaceInput('git@git.example.com:team/private.git')).toMatchObject({
      kind: 'git',
    });
    expect(Object.keys(parseMarketplaceInput('your-org/your-marketplace')).sort()).not.toContain(
      'token',
    );
  });
});

spec(`${P}Prepare your plugin for release`, () => {
  test('a name that is not kebab-case draws a validation warning', async () => {
    const found = await issues({
      [MARKET]: JSON.stringify({
        ...JSON.parse(file),
        plugins: [{ name: 'Deploy_Helper', source: './' }],
      }),
      [PLUGIN]: manifest({ name: 'Deploy_Helper' }),
    });
    expect(
      found.some((issue) => issue.severity === 'warning' && issue.message.includes('kebab-case')),
    ).toBe(true);
  });
  test('an update with an unchanged version prints "<name> is already at the latest version (<version>)."', () => {
    expect(upToDateMessage('deploy-helper', '1.0.0')).toBe(
      'deploy-helper is already at the latest version (1.0.0).',
    );
  });
  test('validation of the plugin and a marketplace install are the other two checks: a valid plugin has no errors', async () => {
    const found = await issues({ [PLUGIN]: manifest() });
    expect(found.filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});

spec(`${P}Ship a plugin with your own tool`, () => {
  test('the two commands are marketplace add <source>, then install <name>@<marketplace>', () => {
    expect(parseMarketplaceInput('your-org/your-marketplace')).toMatchObject({
      kind: 'github',
      repo: 'your-org/your-marketplace',
    });
    const plan = planInstallCommand({ surface: 'shell', plugin: 'deploy-helper@your-marketplace' });
    expect('severity' in plan).toBe(false);
    expect(plan).toMatchObject({ installs: true, addsMarketplace: false });
  });
});

spec('marketplace.troubleshooting.Marketplace add fails on a GitHub Enterprise Server host', () => {
  const ghes = git('https://ghes.example.com/org/marketplace.git');
  test('a GHES address is outside a github-only allowlist; an admin adds a hostPattern for the host', () => {
    expect(admits({ source: 'github', repo: 'org/marketplace' }, ghes)).toBe(false);
    expect(admits(hostPattern('^ghes\\.example\\.com$'), ghes)).toBe(true);
    expect(admits(hostPattern('^other\\.example\\.com$'), ghes)).toBe(false);
  });
});
