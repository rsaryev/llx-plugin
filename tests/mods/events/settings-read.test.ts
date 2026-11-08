/**
 * The `settings.read` event as events.md describes it: § Change or refuse a settings read (what a hook
 * receives, how it tells Claude Code's own read from a mod's, what it can return, what `next(e)`
 * gives it, the one-key example), plugins/mods/reference.md § Commands and configuration
 * ("`e.layers` and `e.source` on `settings.read`"), plugins/mods/troubleshoot.md § A key your
 * `settings.read` hook returns doesn't take effect, `the answer for <key> is no value the key can
 * hold` and `settings.read: refused to the engine` (the debug-log lines). `$.settings.read` itself is
 * `tests/mods/api/settings.test.ts`; here each requirement of the prose has its own test.
 */
import { describe, expect, test } from 'bun:test';
import { readEngineSettings, settingsLayersForMods } from '../../../src/mods/api/index.ts';
import type { PolicyLayer } from '../../../src/settings/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { engineRead, LAYERS, MERGED, ORIGIN, settings } from '../../support/mods-settings-read.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { registerOf } from '../../support/mods-load.ts';
import { runPluginTests } from '../../support/mods-testing.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

describe('what a settings.read hook receives', () => {
  spec('mods.events.What a settings.read hook receives', () => {
    test('e.layers holds one { source, settings } for each source in use that holds settings, lowest precedence first: plugin, user, project, local, flag, policy', () => {
      const given: PolicyLayer[] = [
        { scope: 'managed', settings: { disableAllHooks: false } },
        { scope: 'user', settings: { model: 'haiku' } },
        { scope: 'flag', settings: { model: 'opus' } },
        { scope: 'project', settings: { model: 'sonnet' } },
        { scope: 'local', settings: { model: 'fast' } },
      ];
      expect(settingsLayersForMods(given, [{ outputStyle: 'terse' }])).toEqual([
        { source: 'plugin', settings: { outputStyle: 'terse' } },
        { source: 'user', settings: { model: 'haiku' } },
        { source: 'project', settings: { model: 'sonnet' } },
        { source: 'local', settings: { model: 'fast' } },
        { source: 'flag', settings: { model: 'opus' } },
        { source: 'policy', settings: { disableAllHooks: false } },
      ]);
    });

    test('a hook on Claude Code own read receives e.layers, and a hook on a mod read of one source receives that layer alone with e.source', async () => {
      const seen: unknown[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('spy', 'prepend', [
        fn('settings.read', (_$, e, next) => (seen.push(e), next(e))),
      ]);
      await readEngineSettings({
        chain: h.chain,
        settings: settings(),
        fits: () => true,
        signal: new AbortController().signal,
        report: () => undefined,
        debug: () => undefined,
      });
      await h.api.settings.read({ source: 'project' });
      expect(seen).toEqual([{ layers: LAYERS }, { source: 'project', layers: [LAYERS[2]] }]);
    });

    test('plugin is a layer name only: it is not a source $.settings.read accepts', async () => {
      const h = await apiHarness({ ports: { settings: settings() } });
      expect(await rejection(h.api.settings.read({ source: 'plugin' }))).toContain(
        '"plugin" is not a settings source',
      );
    });

    test('e.layers is empty in claude plugin test', async () => {
      const seen: unknown[] = [];
      const watcher = registerOf((on) => {
        on('settings.read', (_$: unknown, e: unknown, next: (e: unknown) => unknown) => {
          seen.push(record(e).layers);
          return next(e);
        });
      });
      const result = await runPluginTests({
        name: 'watcher',
        register: watcher,
        tests: {
          'tests/watcher.test.ts': ({ test }) => {
            test('reads', async (claude, on) => {
              on('settings.read', () => ({ value: {} }));
              await claude['settings']?.['read']?.({});
            });
          },
        },
      });
      expect(result.passed).toBe(1);
      expect(seen).toEqual([[]]);
    });
  });

  spec('mods.reference.e.layers and e.source on settings.read', () => {
    test('e.source is the one source a mod asked for, and e.layers then holds that layer alone', async () => {
      const seen: Record<string, unknown>[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('spy', 'prepend', [
        fn('settings.read', (_$, e, next) => (seen.push(e), next(e))),
      ]);
      await h.api.settings.read({ source: 'policy' });
      expect(seen).toEqual([{ source: 'policy', layers: [LAYERS[3]] }]);
    });

    test('e.source is absent on Claude Code own read and on a read of the merged settings', async () => {
      const seen: Record<string, unknown>[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('spy', 'prepend', [
        fn('settings.read', (_$, e, next) => (seen.push(e), next(e))),
      ]);
      await h.api.settings.read();
      await h.api.settings.read({ key: 'model' });
      await readEngineSettings({
        chain: h.chain,
        settings: settings(),
        fits: () => true,
        signal: new AbortController().signal,
        report: () => undefined,
        debug: () => undefined,
      });
      expect(seen.map((e) => 'source' in e)).toEqual([false, false, false]);
      expect(seen.map((e) => Array.isArray(e.layers) && e.layers.length)).toEqual([4, 4, 4]);
    });
  });
});

describe('tell Claude Code own read from a mod read', () => {
  spec(`mods.events.Tell Claude Code's own read from a mod's read`, () => {
    test('next.origin is { plugin: "engine", tier: "core" } on Claude Code own read and the calling mod on a mod read', async () => {
      const origins: unknown[] = [];
      const h = await apiHarness({ ports: { settings: settings() }, plugin: 'caller' });
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
      expect(origins).toEqual([{ plugin: 'caller', tier: 'user' }, ORIGIN]);
    });

    test('a hook that tests next.origin changes only Claude Code own read', async () => {
      const own = fn('settings.read', async (_$, e, next) => {
        const read = record(await next(e));
        if (next.origin.plugin !== 'engine' || !read.value) return read;
        return { value: { ...record(read.value), spinnerTipsEnabled: false } };
      });
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('quiet', 'prepend', [own]);
      expect(await h.api.settings.read({ key: 'spinnerTipsEnabled' })).toBe(true);
      const engine = await readEngineSettings({
        chain: h.chain,
        settings: settings(),
        fits: () => true,
        signal: new AbortController().signal,
        report: () => undefined,
        debug: () => undefined,
      });
      expect(engine.spinnerTipsEnabled).toBe(false);
    });
  });
});

describe('what a settings.read hook can return', () => {
  spec('mods.events.What a settings.read hook can return', () => {
    test('{ value } on Claude Code own read replaces the whole value of each key changed, when it fits the key schema; a key left out is unset', async () => {
      const { value } = await engineRead(
        [
          fn('settings.read', () => ({
            value: { model: 'opus', outputStyle: ['not', 'a', 'string'] },
          })),
        ],
        { fits: (key, answered) => key !== 'outputStyle' || typeof answered === 'string' },
      );
      expect(value).toEqual({ model: 'opus', outputStyle: 'terse' });
    });

    test('{ value } on a mod read: the call resolves to the value, or to the key it asked for taken from it', async () => {
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('stub', 'prepend', [
        fn('settings.read', () => ({ value: { model: 'opus', theme: 'dark' } })),
      ]);
      expect(await h.api.settings.read()).toEqual({ model: 'opus', theme: 'dark' });
      expect(await h.api.settings.read({ key: 'theme' })).toBe('dark');
    });

    test('{ deny } on Claude Code own read keeps the settings as merged before any hook answered, and the debug log records the reason', async () => {
      const { value, debug } = await engineRead([
        fn('settings.read', () => ({ deny: 'no reads' })),
      ]);
      expect(value).toEqual(MERGED);
      expect(debug.join('\n')).toContain('no reads');
    });

    test('{ deny } on a mod read rejects the call with "<calling mod>: $.settings.read: <reason>"', async () => {
      const h = await apiHarness({ ports: { settings: settings() }, plugin: 'caller' });
      await h.mod('private', 'prepend', [
        fn('settings.read', () => ({ deny: 'keys are private' })),
      ]);
      expect(await rejection(h.api.settings.read({ key: 'model' }))).toBe(
        'caller: $.settings.read: keys are private',
      );
    });

    test('a hook that returns what next(e) gave leaves the read as it is', async () => {
      const { value } = await engineRead([fn('settings.read', (_$, e, next) => next(e))]);
      expect(value).toEqual(MERGED);
    });
  });
});

describe('what next(e) gives a settings.read hook', () => {
  spec('mods.events.What next(e) gives a settings.read hook', () => {
    test('{ value } with the merged settings, or one source settings when e.source is set', async () => {
      const gave: unknown[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('spy', 'prepend', [
        fn('settings.read', async (_$, e, next) => (gave.push(await next(e)), next(e))),
      ]);
      await h.api.settings.read();
      await h.api.settings.read({ source: 'project' });
      expect(gave).toEqual([{ value: MERGED }, { value: { model: 'sonnet' } }]);
    });

    test('when a hook that runs after yours returned a { value } of its own, you get that value instead', async () => {
      const gave: unknown[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('outer', 'prepend', [
        fn('settings.read', async (_$, e, next) => (gave.push(await next(e)), next(e))),
      ]);
      await h.mod('inner', 'user', [fn('settings.read', () => ({ value: { model: 'inner' } }))]);
      await h.api.settings.read();
      expect(gave).toEqual([{ value: { model: 'inner' } }]);
    });

    test('when a hook that runs after yours refused the read, you get its { deny }, and returning it unchanged refuses the read', async () => {
      const gave: unknown[] = [];
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('outer', 'prepend', [
        fn('settings.read', async (_$, e, next) => {
          const read = await next(e);
          gave.push(read);
          return read;
        }),
      ]);
      await h.mod('inner', 'user', [fn('settings.read', () => ({ deny: 'refused later' }))]);
      expect(await rejection(h.api.settings.read())).toContain('$.settings.read: refused later');
      expect(gave).toEqual([{ deny: 'refused later' }]);
    });
  });
});
