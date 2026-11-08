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
import { spec } from '../support/spec.ts';

const DAY = 24 * 60 * 60 * 1000;
const join = (base: string, rel: string): string => `${base}/${rel}`;
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
      dirsToOrphan([record('/p/cache/acme/f/1.0.0')], [record('/p/cache/acme/f/1.1.0')]),
    ).toEqual(['/p/cache/acme/f/1.0.0']);
  });

  test('an uninstall marks the directory of the removed install', () => {
    expect(dirsToOrphan([record('/p/cache/acme/f/1.0.0')], [])).toEqual(['/p/cache/acme/f/1.0.0']);
  });

  test('the directory goes 14 days after it was marked, not before', () => {
    expect(ORPHAN_GRACE_MS).toBe(14 * DAY);
    const orphans = [{ dir: '/old', orphanedAtMs: 0 }];
    const remaining = [record('/p/live')];
    expect(orphanSweep({ remaining, orphans, nowMs: 14 * DAY - 1 })).toEqual([]);
    expect(orphanSweep({ remaining, orphans, nowMs: 14 * DAY })).toEqual(['/old']);
    expect(orphanSweep({ remaining, orphans, nowMs: 30 * DAY })).toEqual(['/old']);
  });

  test('only the directories past 14 days are removed', () => {
    const orphans = [
      { dir: '/a', orphanedAtMs: 0 },
      { dir: '/b', orphanedAtMs: 10 * DAY },
    ];
    expect(orphanSweep({ remaining: [record('/p/live')], orphans, nowMs: 15 * DAY })).toEqual([
      '/a',
    ]);
  });

  test('the sweep runs only while installed_plugins.json records at least one install', () => {
    const orphans = [{ dir: '/old', orphanedAtMs: 0 }];
    expect(orphanSweep({ remaining: [], orphans, nowMs: 99 * DAY })).toEqual([]);
    expect(orphanSweep({ remaining: [record('/p/live')], orphans, nowMs: 99 * DAY })).toEqual([
      '/old',
    ]);
  });
});

describe('a directory a record still points at', () => {
  test('is not marked when another scope still installs the same version', () => {
    expect(dirsToOrphan([record('/p/v1')], [record('/p/v1')])).toEqual([]);
  });

  test('is not swept even with an old marker', () => {
    expect(
      orphanSweep({
        remaining: [record('/p/v1')],
        orphans: [{ dir: '/p/v1', orphanedAtMs: 0 }],
        nowMs: 99 * DAY,
      }),
    ).toEqual([]);
  });

  test('several removed installs of one directory mark it once', () => {
    expect(dirsToOrphan([record('/p/v1'), record('/p/v1')], [])).toEqual(['/p/v1']);
  });
});
