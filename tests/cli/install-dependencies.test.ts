/**
 * plugins/install.md § Plugins with dependencies: "Install: Claude Code also installs and enables
 * the plugin's declared dependencies at the same scope. The success message lists them." § Choose an
 * install scope: a plugin whose author set `defaultEnabled` to off "is installed but stays off until
 * you turn it on"; plugins/marketplace-reference.md `defaultEnabled`: "Default `true`". The wording
 * of the list, a dependency enabled whatever its own `defaultEnabled`, and a dependency installed at
 * another scope only being installed again here are judgments in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { effectsOf, installed, plugin, printed, run } from '../support/install.ts';
import { spec } from '../support/spec.ts';

const withLib = [
  plugin('formatter', { entry: ['lib'] }),
  plugin('lib', { entry: ['base'] }),
  plugin('base'),
];

spec('install.guide.Plugins with dependencies.Install', () => {
  test('installs the declared dependencies at the same scope, dependencies first, and turns them on', async () => {
    const found = await run({ args: { scope: 'project' }, catalog: withLib });
    expect(effectsOf(found)).toMatchObject({ scope: 'project', install: true, enable: true });
    expect(effectsOf(found)?.steps.map((step) => [step.id, step.action])).toEqual([
      ['base@m', 'install'],
      ['lib@m', 'install'],
    ]);
  });

  test('the success message lists them', async () => {
    const found = await run({ args: { scope: 'project' }, catalog: withLib });
    expect(printed(found).stdout).toEqual([
      'Successfully installed plugin: formatter@m (scope: project) (+ 2 dependencies: base@m, lib@m)',
    ]);
  });

  test('a plugin without dependencies prints no list', async () => {
    expect(printed(await run()).stdout).toEqual([
      'Successfully installed plugin: formatter@m (scope: user)',
    ]);
  });

  test('a dependency installed but disabled is enabled, not installed again', async () => {
    const found = await run({
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib')],
      have: [installed('lib@m', { enabled: false })],
    });
    expect(effectsOf(found)?.steps.map((step) => [step.id, step.action])).toEqual([
      ['lib@m', 'enable'],
    ]);
  });

  test('a dependency installed at another scope only is installed at the target scope too', async () => {
    const found = await run({
      args: { scope: 'project' },
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib')],
      have: [installed('lib@m', { scope: 'user' })],
    });
    expect(effectsOf(found)?.steps.map((step) => [step.id, step.action])).toEqual([
      ['lib@m', 'install'],
    ]);
  });
});

spec('manifest.rule.defaultEnabled', () => {
  test('a plugin whose author set defaultEnabled false is installed but stays off', async () => {
    const found = await run({ catalog: [plugin('formatter', { defaultEnabled: false })] });
    expect(effectsOf(found)).toMatchObject({ install: true, enable: false });
  });
});

describe('judgments: defaultEnabled of a dependency', () => {
  test('a dependency is installed and enabled whatever its own defaultEnabled: the plugin that needs it would not work otherwise', async () => {
    const found = await run({
      catalog: [plugin('formatter', { entry: ['lib'] }), plugin('lib', { defaultEnabled: false })],
    });
    expect(effectsOf(found)?.steps.map((step) => [step.id, step.action])).toEqual([
      ['lib@m', 'install'],
    ]);
    expect(effectsOf(found)?.enable).toBe(true);
  });
});

// A catalog plugin whose plugin.json is unread stops the run before anything prints: the host
// fetches what it needs and plans again (judgment `installNeeds`, spec/judgments.md).
describe('a dependency plan that needs a plugin fetched', () => {
  const unread = ([id, entry]: ReturnType<typeof plugin>) =>
    [id, { ...entry, manifestUnread: true as const }] as const;

  test('the run names what it needs and prints nothing; with it read, the install goes on', async () => {
    const asked = await run({
      catalog: [unread(plugin('formatter', { manifest: ['lib'] })), plugin('lib')],
    });
    expect(asked).toEqual({ before: [], needs: ['formatter@m'] });
    const done = await run({
      catalog: [plugin('formatter', { manifest: ['lib'] }), plugin('lib')],
    });
    expect(effectsOf(done)?.steps.map((step) => step.id)).toEqual(['lib@m']);
  });

  test('an installed plugin re-run plans its missing dependencies only once they are known', async () => {
    const have = [installed('formatter@m')];
    const catalog = [unread(plugin('formatter', { manifest: ['lib'] })), plugin('lib')];
    expect(await run({ catalog, have })).toEqual({ before: [], needs: ['formatter@m'] });
  });
});
