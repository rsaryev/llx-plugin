/**
 * plugins/cli-reference.md § plugin uninstall, "What an uninstall deletes and keeps": "When you
 * uninstall a plugin from the last scope it's installed at, Claude Code also deletes the plugin's
 * stored options and secrets and its data directory, `~/.claude/plugins/data/<id>/`. There are three
 * exceptions: With `--keep-data`, the data directory stays; when another installed plugin uses the
 * same folder, such as one whose ID differs from this one only in letter case, the data directory
 * stays; when Claude Code can't read the list of installed plugins back after it removes the plugin
 * from that scope, the options, secrets, and data directory all stay ... and with `--json` the result
 * carries `savedKept: "install_records_unreadable"`". The folder name is `pluginDataId`
 * (manifest-reference.md, "Environment variables").
 */
import { describe, expect, test } from 'bun:test';
import { uninstallRetention } from '../../src/cli/uninstall-data.ts';
import type { InstalledRecord } from '../../src/marketplace/dependency-graph.ts';
import { spec } from '../support/spec.ts';

const record = (id: string, scope: InstalledRecord['scope'] = 'user'): InstalledRecord => ({
  id,
  scope,
  dependencies: [],
});

const retention = (extra: Partial<Parameters<typeof uninstallRetention>[0]> = {}) =>
  uninstallRetention({ id: 'formatter@m', scope: 'project', remaining: [], ...extra });

spec('cli.plugin.What an uninstall deletes and keeps', () => {
  test('from the last scope it deletes the options, the secrets and the data directory', () => {
    expect(retention()).toMatchObject({
      saved: 'delete',
      data: 'delete',
      dataFolder: 'formatter-m',
    });
  });

  test('--keep-data keeps the data directory and still deletes the options and secrets', () => {
    const found = retention({ keepData: true });
    expect(found).toMatchObject({ saved: 'delete', data: 'keep', dataKeptBecause: 'keep-data' });
  });

  test('another installed plugin whose id differs only in letter case keeps the data directory', () => {
    const found = retention({ remaining: [record('Formatter@M')] });
    expect(found).toMatchObject({
      saved: 'delete',
      data: 'keep',
      dataKeptBecause: 'shared-folder',
    });
  });

  test('ids that sanitize to the same folder share it', () => {
    const found = retention({ remaining: [record('formatter.m')] });
    expect(found.dataKeptBecause).toBe('shared-folder');
  });

  test('a plugin with another folder does not keep the data directory', () => {
    expect(retention({ remaining: [record('other@m')] }).data).toBe('delete');
  });

  test('records that cannot be read back keep the options, the secrets and the data directory', () => {
    const found = retention({ remaining: 'unreadable' });
    expect(found).toMatchObject({
      saved: 'keep',
      data: 'keep',
      savedKept: 'install_records_unreadable',
      dataKeptBecause: 'install_records_unreadable',
    });
  });

  test('--keep-data with unreadable records still reports savedKept', () => {
    const found = retention({ remaining: 'unreadable', keepData: true });
    expect(found.savedKept).toBe('install_records_unreadable');
  });
});

describe('uninstalling from a scope that is not the last', () => {
  test('keeps the options, the secrets and the data directory: the plugin is still installed', () => {
    const found = retention({ remaining: [record('formatter@m', 'user')] });
    expect(found).toMatchObject({ saved: 'keep', data: 'keep', dataKeptBecause: 'other-scope' });
    expect(found.savedKept).toBeUndefined();
  });
});
