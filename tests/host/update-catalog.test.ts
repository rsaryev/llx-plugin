/**
 * The host reads the Markdown of a plugin once per `Plugin` object (docs/API.md, "Host and
 * sessions", "Updating"): an update that keeps a plugin does not read its skills, commands, agents
 * and output styles again, one that gives a new object for it does. Integration tests of the host,
 * outside `spec()`; the cache key is a row in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { Plugin } from '../../src/loading/index.ts';
import { createPolicyView } from '../../src/settings/index.ts';
import { hostOf, SESSION } from '../support/host.ts';
import { layerOf } from '../support/settings-layers.ts';
import { hostPlugin, pluginOf, skillText } from '../support/update.ts';

/** The plugin with a count of how many times its skill files were read. */
function watched(plugin: Plugin): { readonly plugin: Plugin; reads(): number } {
  let reads = 0;
  return {
    plugin: new Proxy(plugin, {
      get(target, key, receiver) {
        if (key === 'skills') reads += 1;
        return Reflect.get(target, key, receiver);
      },
    }),
    reads: () => reads,
  };
}

const withSkill = (name: string) => pluginOf(name, { skills: { go: skillText('Go') } });

describe('readCatalog is cached per plugin object', () => {
  test('creating the host reads an enabled plugin once, a disabled one not at all', async () => {
    const on = watched(await withSkill('on'));
    const off = watched(await withSkill('off'));
    await hostOf({
      plugins: [hostPlugin('on@acme', on.plugin), hostPlugin('off@acme', off.plugin, false)],
    });
    expect([on.reads(), off.reads()]).toEqual([1, 0]);
  });

  test('an update that keeps the plugin does not read it again, whatever else changes', async () => {
    const kept = watched(await withSkill('kept'));
    const { host } = await hostOf({ plugins: [hostPlugin('kept@acme', kept.plugin)] });
    host.update({ settings: createPolicyView([layerOf('user', { disableAllHooks: true })]) });
    host.update({ userConfig: { 'kept@acme': {} } });
    host.update({
      plugins: [
        hostPlugin('kept@acme', kept.plugin),
        hostPlugin('new@acme', await withSkill('new')),
      ],
    });
    expect(kept.reads()).toBe(1);
  });

  test('the new object of a plugin, with the same id, is read', async () => {
    const first = watched(await withSkill('same'));
    const second = watched(await withSkill('same'));
    const { host } = await hostOf({ plugins: [hostPlugin('same@acme', first.plugin)] });
    host.update({ plugins: [hostPlugin('same@acme', second.plugin)] });
    expect([first.reads(), second.reads()]).toEqual([1, 1]);
  });

  test('a plugin switched off and on again is not read while it is off, and not again for the same object', async () => {
    const toggled = watched(await withSkill('toggled'));
    const { host } = await hostOf({ plugins: [hostPlugin('toggled@acme', toggled.plugin)] });
    host.update({ plugins: [hostPlugin('toggled@acme', toggled.plugin, false)] });
    host.update({ plugins: [hostPlugin('toggled@acme', toggled.plugin, true)] });
    expect(toggled.reads()).toBe(1);
  });

  test('a plugin that was off at the start is read when it is switched on, once', async () => {
    const late = watched(await withSkill('late'));
    const { host } = await hostOf({ plugins: [hostPlugin('late@acme', late.plugin, false)] });
    host.update({ plugins: [hostPlugin('late@acme', late.plugin, true)] });
    host.update({ settings: createPolicyView([]) });
    expect(late.reads()).toBe(1);
  });

  test('sessions never read a plugin: opening one and using it adds no read', async () => {
    const kept = watched(await withSkill('kept'));
    const { host } = await hostOf({ plugins: [hostPlugin('kept@acme', kept.plugin)] });
    const session = host.openSession(SESSION);
    session.skills();
    host.update({});
    session.skills();
    expect(kept.reads()).toBe(1);
  });
});
