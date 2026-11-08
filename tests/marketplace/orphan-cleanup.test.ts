/**
 * plugins/loading.md § Cleanup of previous versions ("When you update or uninstall a plugin, Claude
 * Code writes an `.orphaned_at` marker into the previous version directory. It removes that directory
 * in a background cleanup 14 days later, so a session that already loaded the old version keeps
 * running. The sweep runs only while `installed_plugins.json` records at least one install."). A
 * directory a record still points at is never swept or marked, and a directory is swept at exactly
 * 14 days: judgments in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import {
  dirsToOrphan,
  ORPHAN_GRACE_MS,
  orphanMarkerPath,
  orphanSweep,
} from '../../src/marketplace/orphan-cleanup.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';
import { spec } from '../support/spec.ts';

const DAY = 24 * 60 * 60 * 1000;
const join = (base: string, rel: string): string => `${base}/${rel}`;
const layout = createStoreLayout('/p', join);
const record = (installPath: string): InstallRecord => ({
  scope: 'user',
  installPath,
  version: 'v',
});

spec('install.loading.Cleanup of previous versions', () => {
  test('the marker is .orphaned_at inside the previous version directory', () => {
    expect(orphanMarkerPath('/p/cache/acme/f/1.0.0', join)).toBe(
      '/p/cache/acme/f/1.0.0/.orphaned_at',
    );
  });

  test('an update marks the directory it replaced', () => {
    expect(
      dirsToOrphan([record('/p/cache/acme/f/1.0.0')], [record('/p/cache/acme/f/1.1.0')], layout),
    ).toEqual(['/p/cache/acme/f/1.0.0']);
  });

  test('an uninstall marks the directory of the removed install', () => {
    expect(dirsToOrphan([record('/p/cache/acme/f/1.0.0')], [], layout)).toEqual([
      '/p/cache/acme/f/1.0.0',
    ]);
  });

  test('the directory goes 14 days after it was marked, not before', () => {
    expect(ORPHAN_GRACE_MS).toBe(14 * DAY);
    const orphans = [{ dir: '/p/cache/old', orphanedAtMs: 0 }];
    const remaining = [record('/p/live')];
    expect(orphanSweep({ remaining, orphans, layout, nowMs: 14 * DAY - 1 })).toEqual([]);
    expect(orphanSweep({ remaining, orphans, layout, nowMs: 14 * DAY })).toEqual(['/p/cache/old']);
    expect(orphanSweep({ remaining, orphans, layout, nowMs: 30 * DAY })).toEqual(['/p/cache/old']);
  });

  test('only the directories past 14 days are removed', () => {
    const orphans = [
      { dir: '/p/cache/a', orphanedAtMs: 0 },
      { dir: '/p/cache/b', orphanedAtMs: 10 * DAY },
    ];
    expect(
      orphanSweep({ remaining: [record('/p/live')], orphans, layout, nowMs: 15 * DAY }),
    ).toEqual(['/p/cache/a']);
  });

  test('the sweep runs only while installed_plugins.json records at least one install', () => {
    const orphans = [{ dir: '/p/cache/old', orphanedAtMs: 0 }];
    expect(orphanSweep({ remaining: [], orphans, layout, nowMs: 99 * DAY })).toEqual([]);
    expect(
      orphanSweep({ remaining: [record('/p/live')], orphans, layout, nowMs: 99 * DAY }),
    ).toEqual(['/p/cache/old']);
  });
});

describe('a directory a record still points at', () => {
  test('is not marked when another scope still installs the same version', () => {
    expect(dirsToOrphan([record('/p/cache/v1')], [record('/p/cache/v1')], layout)).toEqual([]);
  });

  test('is not swept even with an old marker', () => {
    expect(
      orphanSweep({
        remaining: [record('/p/cache/v1')],
        orphans: [{ dir: '/p/cache/v1', orphanedAtMs: 0 }],
        layout,
        nowMs: 99 * DAY,
      }),
    ).toEqual([]);
  });

  test('several removed installs of one directory mark it once', () => {
    expect(dirsToOrphan([record('/p/cache/v1'), record('/p/cache/v1')], [], layout)).toEqual([
      '/p/cache/v1',
    ]);
  });
});

describe('a directory outside the plugin cache', () => {
  test('such as the source directory of a plugin loaded in place, is never marked for an uninstall or an update', () => {
    expect(dirsToOrphan([record('/m/plugins/f')], [], layout)).toEqual([]);
    expect(dirsToOrphan([record('/m/plugins/f'), record('/p/cache/a/f/1')], [], layout)).toEqual([
      '/p/cache/a/f/1',
    ]);
  });

  test('is never swept, even with an old marker and no record using it', () => {
    expect(
      orphanSweep({
        remaining: [record('/p/live')],
        orphans: [{ dir: '/m/plugins/f', orphanedAtMs: 0 }],
        layout,
        nowMs: 99 * DAY,
      }),
    ).toEqual([]);
  });

  test('a sibling folder that merely starts with the cache name is outside it', () => {
    expect(dirsToOrphan([record('/p/cache-old/a/f/1')], [], layout)).toEqual([]);
  });
});
