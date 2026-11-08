/** plugins/mods/events.md § What a settings.read hook receives: real policy layers feed engine reads. */
import { expect, test } from 'bun:test';
import { createModSettingsReader, readEngineSettings } from '../../../src/mods/api/index.ts';
import type { JsonObject } from '../../../src/foundation/index.ts';
import { readSettingsLayer } from '../../../src/settings/index.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { fn } from '../../support/mods-chain.ts';
import { spec } from '../../support/spec.ts';

spec('mods.events.What a settings.read hook receives', () => {
  test('the reader orders actual settings sources and plugin defaults for the dispatched event', async () => {
    const settings = createModSettingsReader({
      layers: () => [
        readSettingsLayer('managed', { model: 'opus' }).layer,
        readSettingsLayer('user', { model: 'haiku' }).layer,
      ],
      plugins: () => [{ agent: 'reviewer' }],
      merged: (layers) =>
        layers.reduce<JsonObject>((merged, layer) => ({ ...merged, ...layer.settings }), {}),
    });
    const h = await apiHarness({ ports: { settings } });
    const seen: unknown[] = [];
    await h.mod('watcher', 'user', [
      fn('settings.read', (_$, e, next) => {
        seen.push(e);
        return next(e);
      }),
    ]);
    const value = await readEngineSettings({
      chain: h.chain,
      settings,
      fits: () => true,
      signal: new AbortController().signal,
      report: () => undefined,
      debug: () => undefined,
    });
    expect(value).toEqual({ agent: 'reviewer', model: 'opus' });
    expect(seen).toEqual([
      {
        layers: [
          { source: 'plugin', settings: { agent: 'reviewer' } },
          { source: 'user', settings: { model: 'haiku' } },
          { source: 'policy', settings: { model: 'opus' } },
        ],
      },
    ]);
  });
});
