/**
 * plugins/loading.md § Find plugins on disk and plugins/troubleshooting.md § `installed_plugins.json
 * could not be read and was rebuilt` and § `install records under names that no version of Claude Code
 * can use were removed` (the dated copies "age out on the `cleanupPeriodDays` schedule"); claude-
 * directory.md § Cleaned up automatically (files "once they're older than `cleanupPeriodDays`";
 * "The default is 30 days and the minimum is 1; setting `0` fails with a validation error"). The
 * table has no requirement id, so these tests sit outside `spec(...)`; the boundary, the fallback for
 * an invalid period and the copies-only rule are rows in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import {
  agedCopies,
  DEFAULT_CLEANUP_PERIOD_DAYS,
  sweepAgedCopies,
} from '../../src/marketplace/copy-sweep.ts';
import { loadInstalledPlugins } from '../../src/marketplace/installed-plugins-store.ts';
import { realSha256 } from '../support/marketplace-ports.ts';
import { fixedClock } from '../support/ports.ts';
import { memoryStateStore } from '../support/plugin-state.ts';

const signal = new AbortController().signal;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const KEPT = 'installed_plugins.unreadable.2026-10-01.abcdef01.kept';
const ASIDE = 'installed_plugins.set-aside.2026-10-01.abcdef01.json';

describe('which copies have aged out', () => {
  test('a dated copy older than cleanupPeriodDays is swept, a younger one stays', () => {
    const entries = [
      { name: KEPT, modifiedAtMs: NOW - 8 * DAY },
      { name: ASIDE, modifiedAtMs: NOW - 6 * DAY },
    ];
    expect(agedCopies({ entries, nowMs: NOW, cleanupPeriodDays: 7 })).toEqual([KEPT]);
  });

  test('the default period is 30 days', () => {
    expect(DEFAULT_CLEANUP_PERIOD_DAYS).toBe(30);
    const entries = [
      { name: KEPT, modifiedAtMs: NOW - 31 * DAY },
      { name: ASIDE, modifiedAtMs: NOW - 29 * DAY },
    ];
    expect(agedCopies({ entries, nowMs: NOW })).toEqual([KEPT]);
  });

  test('a judgment: a copy exactly as old as the period is not yet older than it', () => {
    const entries = [{ name: KEPT, modifiedAtMs: NOW - 7 * DAY }];
    expect(agedCopies({ entries, nowMs: NOW, cleanupPeriodDays: 7 })).toEqual([]);
    expect(agedCopies({ entries, nowMs: NOW + 1, cleanupPeriodDays: 7 })).toEqual([KEPT]);
  });

  test.each([[0], [-3], [1.5], [Number.NaN]])(
    'a judgment: %p is no valid period (the minimum is 1, a whole number), so the default applies',
    (days) => {
      const entries = [
        { name: KEPT, modifiedAtMs: NOW - 31 * DAY },
        { name: ASIDE, modifiedAtMs: NOW - 2 * DAY },
      ];
      expect(agedCopies({ entries, nowMs: NOW, cleanupPeriodDays: days })).toEqual([KEPT]);
    },
  );

  test('a judgment: only dated copies are ever swept, however old the other files are', () => {
    const entries = ['installed_plugins.json', 'known_marketplaces.json', 'cache', 'data', 'x'].map(
      (name) => ({ name, modifiedAtMs: 0 }),
    );
    expect(agedCopies({ entries, nowMs: NOW, cleanupPeriodDays: 1 })).toEqual([]);
  });
});

describe('sweeping through the store', () => {
  test('removes the aged copies and leaves everything else', async () => {
    const store = memoryStateStore(
      { 'installed_plugins.json': '{}', [KEPT]: 'old', [ASIDE]: 'new' },
      [],
      { 'installed_plugins.json': NOW - 90 * DAY, [KEPT]: NOW - 40 * DAY, [ASIDE]: NOW - 2 * DAY },
    );
    const swept = await sweepAgedCopies({ store, clock: fixedClock(NOW) }, {}, signal);
    expect(swept).toEqual({ removed: [KEPT], failures: [] });
    expect(Object.keys(store.files)).toEqual(['installed_plugins.json', ASIDE]);
  });

  test('a copy with no known age is left alone', async () => {
    const store = memoryStateStore({ [KEPT]: 'old' });
    const swept = await sweepAgedCopies({ store, clock: fixedClock(NOW) }, {}, signal);
    expect(swept.removed).toEqual([]);
    expect(store.removals).toEqual([]);
  });

  test('a removal that fails is reported and the copy stays for the next sweep', async () => {
    const store = memoryStateStore({ [KEPT]: 'old', [ASIDE]: 'old' }, [KEPT], {
      [KEPT]: NOW - 40 * DAY,
      [ASIDE]: NOW - 40 * DAY,
    });
    const swept = await sweepAgedCopies({ store, clock: fixedClock(NOW) }, {}, signal);
    expect(swept.removed).toEqual([ASIDE]);
    expect(swept.failures).toEqual([{ failure: 'remove', message: `cannot remove ${KEPT}` }]);
    expect(Object.keys(store.files)).toEqual([KEPT]);
  });

  test('the copies loadInstalledPlugins writes are the ones that age out later', async () => {
    const store = memoryStateStore({ 'installed_plugins.json': '{ garbage' }, [], {}, () => NOW);
    await loadInstalledPlugins({ store, sha256: realSha256, clock: fixedClock(NOW) }, signal);
    const copy = (await store.names(signal)).find((name) => name.endsWith('.kept'));
    expect(copy).toBeDefined();
    const later = await sweepAgedCopies(
      { store, clock: fixedClock(NOW + 31 * DAY) },
      { cleanupPeriodDays: 30 },
      signal,
    );
    expect(later.removed).toEqual(copy === undefined ? [] : [copy]);
  });
});
