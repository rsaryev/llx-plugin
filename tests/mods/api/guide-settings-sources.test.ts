/**
 * plugins/mods/api.md § Read all settings, one source, or one key: each name denotes its real host
 * settings tier. This uses the kit's reader/merge bridge, not a test-defined Object.assign merge.
 */
import { expect, test } from 'bun:test';
import { createModSettingsReader } from '../../../src/mods/api/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const layers = [
  layerOf('user', { model: 'user-model' }),
  layerOf('project', { model: 'project-model' }),
  layerOf('local', { model: 'local-model' }),
  layerOf('flag', { model: 'flag-model' }),
  layerOf('managed', { model: 'managed-model' }),
];

const sources = [
  ['user', 'user-model'],
  ['project', 'project-model'],
  ['local', 'local-model'],
  ['flag', 'flag-model'],
  ['policy', 'managed-model'],
] as const;

for (const [source, model] of sources) {
  spec(`mods.apiGuide.Read all settings, one source, or one key.${source}`, () => {
    test('the source is read through the real settings bridge, and key selects within it', async () => {
      const settings = createModSettingsReader({ layers: () => layers });
      const { api } = await apiHarness({ ports: { settings } });
      expect(await api.settings.read({ source })).toMatchObject({ model });
      expect(await api.settings.read({ source, key: 'model' })).toBe(model);
      expect(await api.settings.read({ source, key: 'absent' })).toBeUndefined();
      expect(await api.settings.read({ key: 'model' })).toBe('managed-model');
    });
  });
}

spec('mods.apiGuide.Read all settings, one source, or one key.$.settings.read()', () => {
  test('the default bridge uses real per-key managed precedence, unions and plugin defaults', async () => {
    const settings = createModSettingsReader({
      layers: () => [
        layerOf('user', {
          enabledPlugins: { 'required@corp': false },
          permissions: { allow: ['Read'] },
        }),
        layerOf('managed', {
          enabledPlugins: { 'required@corp': true },
          permissions: { deny: ['Bash(rm *)'] },
        }),
      ],
      plugins: () => [{ agent: 'corp:review', model: 'ignored-plugin-model' }],
    });
    const { api } = await apiHarness({ ports: { settings } });
    expect(await api.settings.read()).toMatchObject({
      agent: 'corp:review',
      enabledPlugins: { 'required@corp': true },
      permissions: { allow: ['Read'], deny: ['Bash(rm *)'] },
    });
    expect(await api.settings.read({ key: 'model' })).toBeUndefined();
  });

  test('an invalid managed value refuses cross-session messages rather than inheriting accept', async () => {
    const settings = createModSettingsReader({
      layers: () => [
        layerOf('user', { crossSessionInbound: 'accept' }),
        layerOf('managed', { crossSessionInbound: 'not-a-mode' }),
      ],
    });
    const { api } = await apiHarness({ ports: { settings } });
    expect(await api.settings.read({ key: 'crossSessionInbound' })).toBe('refuse');
  });

  test('a non-managed invalid value keeps its hold floor, even below a higher accept', async () => {
    const settings = createModSettingsReader({
      layers: () => [
        layerOf('user', { crossSessionInbound: 'not-a-mode' }),
        layerOf('managed', { crossSessionInbound: 'accept' }),
      ],
    });
    const { api } = await apiHarness({ ports: { settings } });
    expect(await api.settings.read({ key: 'crossSessionInbound' })).toBe('hold');
  });
});
