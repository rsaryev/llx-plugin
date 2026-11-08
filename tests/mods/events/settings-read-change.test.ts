/**
 * Changing one setting from a `settings.read` hook, and the troubleshooting of one. plugins/mods/events.md
 * § Change one setting from a `settings.read` hook; plugins/mods/troubleshoot.md § A key your
 * `settings.read` hook returns doesn't take effect, `the answer for <key> is no value the key can hold`
 * and `settings.read: refused to the engine` (the debug-log lines).
 */

import { describe, expect, test } from 'bun:test';
import { readEngineSettings } from '../../../src/mods/api/index.ts';
import { fn, record } from '../../support/mods-chain.ts';
import { engineRead, MERGED, settings } from '../../support/mods-settings-read.ts';
import { apiHarness } from '../../support/mods-api.ts';
import { rejection } from '../../support/rejection.ts';
import { spec } from '../../support/spec.ts';

describe('change one setting from a settings.read hook', () => {
  /** The hook of events.md. */
  const spinnerTips = () =>
    fn('settings.read', async (_$, e, next) => {
      const read = record(await next(e));
      if (e.source || !read.value) return read;
      return { value: { ...record(read.value), spinnerTipsEnabled: false } };
    });

  spec('mods.events.Change one setting from a settings.read hook', () => {
    test('the hook changes the key on Claude Code own read and on a mod merged read alike, keeping every other key', async () => {
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('quiet', 'prepend', [spinnerTips()]);
      expect(await h.api.settings.read()).toEqual({ ...MERGED, spinnerTipsEnabled: false });
      const engine = await readEngineSettings({
        chain: h.chain,
        settings: settings(),
        fits: () => true,
        signal: new AbortController().signal,
        report: () => undefined,
        debug: () => undefined,
      });
      expect(engine).toEqual({ ...MERGED, spinnerTipsEnabled: false });
    });

    test('a read of one source passes through, so only the merged settings change', async () => {
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('quiet', 'prepend', [spinnerTips()]);
      expect(await h.api.settings.read({ source: 'user' })).toEqual({
        spinnerTipsEnabled: true,
        model: 'haiku',
      });
    });

    test('a { deny } from a later hook passes through too: it has no value', async () => {
      const h = await apiHarness({ ports: { settings: settings() } });
      await h.mod('quiet', 'prepend', [spinnerTips()]);
      await h.mod('private', 'user', [fn('settings.read', () => ({ deny: 'private' }))]);
      expect(await rejection(h.api.settings.read())).toContain('$.settings.read: private');
    });

    test('a value outside the key schema leaves that key alone as merged, and the debug log names the key', async () => {
      const { value, debug } = await engineRead(
        [fn('settings.read', () => ({ value: { ...MERGED, spinnerTipsEnabled: 'no' } }))],
        { fits: (key, answered) => key !== 'spinnerTipsEnabled' || typeof answered === 'boolean' },
      );
      expect(value).toEqual(MERGED);
      expect(debug.join('\n')).toContain(
        'the answer for spinnerTipsEnabled is no value the key can hold',
      );
    });
  });
});

describe('troubleshooting a settings.read hook', () => {
  spec(
    `mods.troubleshoot.A key your settings.read hook returns doesn't take effect.settings.read hook skipped`,
    () => {
      test('a hook that throws on Claude Code own read is reported "<mod>: settings.read hook skipped: <reason>", and the settings stand', async () => {
        const { value, reports } = await engineRead([
          fn('settings.read', () => Promise.reject(new Error('boom'))),
        ]);
        expect(value).toEqual(MERGED);
        expect(reports).toEqual(['my-mod: settings.read hook skipped: threw Error: boom']);
      });
    },
  );

  spec(
    `mods.troubleshoot.A key your settings.read hook returns doesn't take effect.answered settings.read without next()`,
    () => {
      test('a mod that runs before yours and answers without next() keeps your hook from running on that read, and the debug log names it', async () => {
        const mine: string[] = [];
        const { value, debug } = await engineRead(
          [fn('settings.read', (_$, e, next) => (mine.push('ran'), next(e)))],
          {
            mods: [
              [
                'acme-policy',
                'prepend',
                [fn('settings.read', () => ({ value: { model: 'acme' } }))],
              ],
            ],
          },
        );
        expect(mine).toEqual([]);
        expect(debug).toContain('acme-policy (prepend) answered settings.read without next()');
        expect(value).toEqual({ model: 'acme' });
      });

      test('a mod that runs after yours is not the cause: your hook runs', async () => {
        const mine: string[] = [];
        await engineRead([fn('settings.read', (_$, e, next) => (mine.push('ran'), next(e)))], {});
        expect(mine).toEqual(['ran']);
      });
    },
  );

  spec(
    `mods.troubleshoot.A key your settings.read hook returns doesn't take effect.settings.read: refused to the engine`,
    () => {
      test('your value did not apply because another hook refused Claude Code own read: the line carries its reason and the settings own values stand', async () => {
        const ran: string[] = [];
        const { value, debug } = await engineRead(
          [
            fn('settings.read', async (_$, e, next) => {
              await next(e);
              ran.push('mine returned a value');
              return { value: { ...MERGED, model: 'mine' } };
            }),
          ],
          {
            afterMine: [
              ['acme-policy', 'user', [fn('settings.read', () => ({ deny: 'acme says no' }))]],
            ],
          },
        );
        expect(ran).toEqual(['mine returned a value']);
        expect(value).toEqual(MERGED);
        expect(debug).toContain(
          "settings.read: refused to the engine (engine: $.settings.read: acme says no); the settings' own values stand",
        );
      });
    },
  );

  spec('mods.troubleshoot.settings.read: refused to the engine', () => {
    test('the line carries the reason of the hook that refused, in the parentheses after "engine: $.settings.read:"', async () => {
      const { debug } = await engineRead([
        fn('settings.read', () => ({ deny: 'reason from my code' })),
      ]);
      expect(debug).toContain(
        "settings.read: refused to the engine (engine: $.settings.read: reason from my code); the settings' own values stand",
      );
    });

    test('Claude Code drops every hook value: the keys of an earlier hook that returned a value do not apply', async () => {
      const { value } = await engineRead([fn('settings.read', () => ({ deny: 'refused' }))], {
        mods: [
          [
            'outer',
            'prepend',
            [
              fn('settings.read', async (_$, e, next) => {
                const read = record(await next(e));
                return read.value ? { value: { ...record(read.value), model: 'outer' } } : read;
              }),
            ],
          ],
        ],
      });
      expect(value).toEqual(MERGED);
    });

    test('a hook that returns { value } when next.origin shows Claude Code own read is not refused', async () => {
      const { value, debug } = await engineRead([
        fn('settings.read', async (_$, e, next) => {
          const read = record(await next(e));
          if (next.origin.plugin !== 'engine') return { deny: 'a mod read' };
          return { value: { ...record(read.value), model: 'mine' } };
        }),
      ]);
      expect(value).toEqual({ ...MERGED, model: 'mine' });
      expect(debug.join('\n')).not.toContain('refused to the engine');
    });
  });

  spec('mods.troubleshoot.the answer for <key> is no value the key can hold', () => {
    const fitsBoolean = (key: string, answered: unknown) =>
      key !== 'spinnerTipsEnabled' || typeof answered === 'boolean';

    test('Claude Code refuses the value for the named key and that key alone, and the line is the documented one', async () => {
      const { value, debug } = await engineRead(
        [
          fn('settings.read', () => ({
            value: { ...MERGED, spinnerTipsEnabled: 'yes', model: 'opus' },
          })),
        ],
        { fits: fitsBoolean },
      );
      expect(value).toEqual({ ...MERGED, model: 'opus' });
      expect(debug).toContain(
        "settings.read: the answer for spinnerTipsEnabled is no value the key can hold; the settings' own value stands",
      );
    });

    test('while the value does not fit, the key keeps the value merged from the settings sources before any hook answered', async () => {
      const merged = { ...MERGED, spinnerTipsEnabled: true };
      const { value } = await engineRead(
        [fn('settings.read', () => ({ value: { ...merged, spinnerTipsEnabled: 3 } }))],
        {
          fits: fitsBoolean,
          mods: [['outer', 'prepend', [fn('settings.read', (_$, e, next) => next(e))]]],
        },
      );
      expect(value.spinnerTipsEnabled).toBe(true);
    });

    test('a value that fits is kept, so the line means the value came from another mod when yours fits', async () => {
      const { value, debug } = await engineRead(
        [fn('settings.read', () => ({ value: { ...MERGED, spinnerTipsEnabled: false } }))],
        { fits: fitsBoolean },
      );
      expect(value.spinnerTipsEnabled).toBe(false);
      expect(debug.join('\n')).not.toContain('no value the key can hold');
    });
  });
});
