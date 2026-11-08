/**
 * plugins/troubleshooting.md § A plugin stays installed after `plugin uninstall` on Windows:
 * `installed_plugins.json` held two install records for the project folder, each spelling the path
 * differently; one uninstall removes the one under its own spelling, and the second run, finding
 * none under its own spelling, removes the one under the other (from v2.1.295).
 */
import { describe, expect, test } from 'bun:test';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { notInstalledInScope, selectUninstall } from '../../src/marketplace/uninstall-records.ts';
import { spec } from '../support/spec.ts';

const record = (projectPath: string, scope: InstallRecord['scope'] = 'project'): InstallRecord => ({
  scope,
  installPath: `/cache/${projectPath}`,
  version: '1',
  projectPath,
});
const upper = record('C:\\work\\app');
const lower = record('c:\\work\\app');

spec('install.troubleshooting.A plugin stays installed after plugin uninstall on Windows', () => {
  test('the first run removes only the record under its own spelling of the folder', () => {
    const first = selectUninstall([upper, lower], {
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(first.removed).toEqual([upper]);
    expect(first.kept).toEqual([lower]);
  });

  test('the same command again finds none under its own spelling and removes the other', () => {
    const second = selectUninstall([lower], {
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(second.removed).toEqual([lower]);
    expect(second.kept).toEqual([]);
  });

  test('a record of the same folder spelled with the other separator goes the same way', () => {
    const slashed = record('C:/work/app');
    const run = selectUninstall([slashed], {
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(run.removed).toEqual([slashed]);
  });

  test('another folder, or another scope, is never removed', () => {
    const other = record('C:\\work\\other');
    const local = record('C:\\work\\app', 'local');
    const run = selectUninstall([other, local, upper], {
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(run.removed).toEqual([upper]);
    expect(run.kept).toEqual([other, local]);
  });

  test('with no record left the command says the plugin is not installed in that scope', () => {
    expect(notInstalledInScope('formatter', 'project')).toBe(
      'Plugin "formatter" is not installed in project scope',
    );
    const run = selectUninstall([], { scope: 'project', projectPath: '/w/a', platform: 'windows' });
    expect(run.removed).toEqual([]);
  });
});

describe('judgments', () => {
  test('off Windows only the same text names the same folder', () => {
    const other = record('/Work/App');
    const run = selectUninstall([other], {
      scope: 'project',
      projectPath: '/work/app',
      platform: 'posix',
    });
    expect(run.removed).toEqual([]);
  });

  test('user scope has no folder: its records are the scope', () => {
    const user: InstallRecord = { scope: 'user', installPath: '/c', version: '1' };
    const run = selectUninstall([user, upper], { scope: 'user', platform: 'windows' });
    expect(run.removed).toEqual([user]);
    expect(run.kept).toEqual([upper]);
  });
});
