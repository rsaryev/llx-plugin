/** Also plugins/mods/api.md § Reach files, processes, and the network. */
/**
 * `$.settings.read` and the `settings.read` event.
 * plugins/mods/api.md § Read all settings, one source, or one key (the four calls and what each
 * resolves to; `source` is `user`, `project`, `local`, `flag` or `policy`; `key` is one top-level
 * key); plugins/mods/events.md § Change or refuse a settings read ("What a `settings.read` hook
 * receives": `e.layers` lowest precedence first, `e.source`; "Tell Claude Code's own read from a
 * mod's read" through `next.origin`; "What a `settings.read` hook can return" and "What `next(e)`
 * gives a `settings.read` hook"; "Change one setting from a `settings.read` hook"), plugins/mods/
 * troubleshoot.md § `the answer for <key> is no value the key can hold` and § `settings.read:
 * refused to the engine` (the debug log lines); plugins/mods/reference.md § Commands and
 * configuration.
 */
import { describe, expect, test } from 'bun:test';
import { readEngineSettings, type SettingsLayer } from '../../../src/mods/api/index.ts';
import { MODS_API } from '../../../src/protocol/mods-api-names.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { apiHarness, expectMethods } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

const LAYERS: readonly SettingsLayer[] = [
  { source: 'user', settings: { spinnerTipsEnabled: true, model: 'haiku' } },
  { source: 'project', settings: { model: 'sonnet' } },
  { source: 'policy', settings: { disableAllHooks: false } },
];

/** The host merges by precedence: later layers win, key by key (the settings stream owns the real rule). */
const merged = (layers: readonly SettingsLayer[]) =>
  Object.assign({}, ...layers.map((layer) => layer.settings));

const settings = (layers = LAYERS) => ({ layers: () => Promise.resolve(layers), merged });

spec(
  [
    'mods.api.$.settings',
    'mods.apiGuide.Reach files, processes, and the network',
    'mods.apiGuide.Reach files, processes, and the network.$.settings',
    'mods.apiGuide.Read all settings, one source, or one key.$.settings.read()',
    "mods.apiGuide.Read all settings, one source, or one key.$.settings.read({ source: 'policy' })",
  ],
  () => {
    test('$.settings has read', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expectMethods(api.settings, MODS_API.settings);
    });

    test('read() resolves to the settings of all sources merged into one object', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expect(await api.settings.read()).toEqual({
        spinnerTipsEnabled: true,
        model: 'sonnet',
        disableAllHooks: false,
      });
    });

    test('read({ source }) resolves to that source alone, or {} when it holds no settings', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expect(await api.settings.read({ source: 'policy' })).toEqual({ disableAllHooks: false });
      expect(await api.settings.read({ source: 'flag' })).toEqual({});
    });

    test('read({ key }) resolves to that key in the merged settings, or undefined when it is not set', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expect(await api.settings.read({ key: 'model' })).toBe('sonnet');
      expect(await api.settings.read({ key: 'outputStyle' })).toBeUndefined();
    });

    test('read({ key, source }) resolves to that key in that one source', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expect(await api.settings.read({ key: 'model', source: 'user' })).toBe('haiku');
      expect(
        await api.settings.read({ key: 'spinnerTipsEnabled', source: 'project' }),
      ).toBeUndefined();
    });

    test('a source that is not one of the five rejects; plugin is a layer name only', async () => {
      const { api } = await apiHarness({ ports: { settings: settings() } });
      expect(await rejection(api.settings.read({ source: 'plugin' }))).toContain(
        '"plugin" is not a settings source',
      );
      expect(await rejection(api.settings.read({ source: 'nowhere' }))).toContain(
        'is not a settings source',
      );
    });
  },
);

const readEngine = async (
  answer: ((e: Record<string, unknown>) => unknown) | undefined,
  fits: (key: string, value: unknown) => boolean = () => true,
) => {
  const h = await apiHarness({ ports: { settings: settings() } });
  if (answer) await h.mod('mod', 'user', [fn('settings.read', (_$, e) => answer(e))]);
  const debug: string[] = [];
  const value = await readEngineSettings({
    chain: h.chain,
    settings: settings(),
    fits,
    signal: new AbortController().signal,
    report: () => undefined,
    debug: (line) => debug.push(line),
  });
  return { value, debug };
};

const fitsBoolean = (key: string, value: unknown) =>
  key !== 'spinnerTipsEnabled' || typeof value === 'boolean';

spec('mods.event.settings.read', () => {
  test('e.layers holds one { source, settings } for each source in use, in the order the host gives (lowest first); no e.source on a merged read', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('spy', 'prepend', [fn('settings.read', (_$, e, next) => (seen.push(e), next(e)))]);
    await h.api.settings.read();
    expect(seen).toEqual([{ layers: LAYERS }]);
  });

  test('on a read of one source e.source names it and e.layers holds that layer alone', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('spy', 'prepend', [fn('settings.read', (_$, e, next) => (seen.push(e), next(e)))]);
    await h.api.settings.read({ source: 'project' });
    expect(seen).toEqual([{ source: 'project', layers: [LAYERS[1]] }]);
  });

  test('next.origin is the calling mod on a mod read and { plugin: "engine", tier: "core" } on Claude Code own read', async () => {
    const origins: unknown[] = [];
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('spy', 'prepend', [
      fn('settings.read', (_$, e, next) => (origins.push(next.origin), next(e))),
    ]);
    await h.api.settings.read();
    await readEngineSettings({
      chain: h.chain,
      settings: settings(),
      fits: () => true,
      signal: new AbortController().signal,
      report: () => undefined,
      debug: () => undefined,
    });
    expect(origins).toEqual([
      { plugin: 'my-mod', tier: 'user' },
      { plugin: 'engine', tier: 'core' },
    ]);
  });

  test('next(e) resolves to { value } with the merged settings, or the one source settings', async () => {
    const answers: unknown[] = [];
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('spy', 'prepend', [
      fn('settings.read', async (_$, e, next) => (answers.push(await next(e)), next(e))),
    ]);
    await h.api.settings.read();
    await h.api.settings.read({ source: 'user' });
    expect(answers).toEqual([
      { value: { spinnerTipsEnabled: true, model: 'sonnet', disableAllHooks: false } },
      { value: { spinnerTipsEnabled: true, model: 'haiku' } },
    ]);
  });

  test('a hook that returns { value } changes what the mod call resolves to (the docs example: spinnerTipsEnabled false)', async () => {
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('quiet', 'prepend', [
      fn('settings.read', async (_$, e, next) => {
        const read = record(await next(e));
        if (e.source || !read.value) return read;
        return { value: { ...record(read.value), spinnerTipsEnabled: false } };
      }),
    ]);
    expect(await h.api.settings.read({ key: 'spinnerTipsEnabled' })).toBe(false);
    expect(await h.api.settings.read({ source: 'user' })).toMatchObject({
      spinnerTipsEnabled: true,
    });
  });

  test('with a key, the call resolves to the key taken from the hook value', async () => {
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('stub', 'prepend', [
      fn('settings.read', () => ({ value: { model: 'opus', other: 1 } })),
    ]);
    expect(await h.api.settings.read({ key: 'model' })).toBe('opus');
    expect(await h.api.settings.read({ key: 'missing' })).toBeUndefined();
  });

  test('a hook that runs after yours and returns { value } wins: next(e) gives that value', async () => {
    const seen: unknown[] = [];
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('outer', 'prepend', [
      fn('settings.read', async (_$, e, next) => (seen.push(await next(e)), next(e))),
    ]);
    await h.mod('inner', 'user', [fn('settings.read', () => ({ value: { model: 'inner' } }))]);
    expect(await h.api.settings.read()).toEqual({ model: 'inner' });
    expect(seen).toEqual([{ value: { model: 'inner' } }]);
  });

  test('{ deny } rejects the mod call with "<calling mod>: $.settings.read: <reason>"', async () => {
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('policy', 'prepend', [
      fn('settings.read', () => ({ deny: 'settings are private' })),
    ]);
    expect(await rejection(h.api.settings.read())).toContain(
      'my-mod: $.settings.read: settings are private',
    );
  });

  test('a hook that runs after yours and refuses: next(e) gives { deny }, which the hook can return unchanged', async () => {
    const h = await apiHarness({ ports: { settings: settings() } });
    await h.mod('outer', 'prepend', [fn('settings.read', async (_$, e, next) => next(e))]);
    await h.mod('inner', 'user', [fn('settings.read', () => ({ deny: 'no' }))]);
    expect(await rejection(h.api.settings.read())).toContain('$.settings.read: no');
  });

  describe('on Claude Code own read', () => {
    test('with no hook the session keeps the merged settings', async () => {
      expect((await readEngine(undefined)).value).toEqual({
        spinnerTipsEnabled: true,
        model: 'sonnet',
        disableAllHooks: false,
      });
    });

    test('a hook that sees e.layers and no e.source can answer { value }: each key it changes replaces the whole value', async () => {
      const seen: unknown[] = [];
      const { value } = await readEngine((e) => {
        seen.push(Object.keys(e));
        return { value: { spinnerTipsEnabled: false, model: 'sonnet', disableAllHooks: false } };
      });
      expect(seen).toEqual([['layers']]);
      expect(value).toEqual({ spinnerTipsEnabled: false, model: 'sonnet', disableAllHooks: false });
    });

    test('a key the hook leaves out is unset', async () => {
      const { value } = await readEngine(() => ({ value: { model: 'sonnet' } }));
      expect(value).toEqual({ model: 'sonnet' });
    });

    test('a value that does not fit the key schema leaves that key alone as merged, and the debug log says so', async () => {
      const { value, debug } = await readEngine(
        () => ({ value: { spinnerTipsEnabled: 'yes', model: 'opus', disableAllHooks: false } }),
        fitsBoolean,
      );
      expect(value).toEqual({ spinnerTipsEnabled: true, model: 'opus', disableAllHooks: false });
      expect(debug).toEqual([
        'mod (user) answered settings.read without next()',
        "settings.read: the answer for spinnerTipsEnabled is no value the key can hold; the settings' own value stands",
      ]);
    });

    test('{ deny } keeps the settings as merged before any hook answered, and the debug log records the reason', async () => {
      const { value, debug } = await readEngine(() => ({ deny: 'not now' }));
      expect(value).toEqual({ spinnerTipsEnabled: true, model: 'sonnet', disableAllHooks: false });
      expect(debug).toEqual([
        'mod (user) answered settings.read without next()',
        "settings.read: refused to the engine (engine: $.settings.read: not now); the settings' own values stand",
      ]);
    });
  });
});
