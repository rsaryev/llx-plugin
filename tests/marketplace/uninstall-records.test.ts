/**
 * plugins/troubleshooting.md § A plugin stays installed after `plugin uninstall` on Windows:
 * `installed_plugins.json` held two install records for the project folder, each spelling the path
 * differently; one uninstall removes the one under its own spelling, and the second run, finding
 * none under its own spelling, removes the one under the other (from v2.1.295).
 */
import { describe, expect, test } from 'bun:test';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { selectUninstall } from '../../src/marketplace/uninstall-records.ts';
import { createStoreLayout } from '../../src/marketplace/store-layout.ts';
import { spec } from '../support/spec.ts';

const layout = createStoreLayout('/p', (base, rel) => `${base}/${rel}`);
const PLUGIN = 'formatter@acme';
const base = { plugin: PLUGIN, layout } as const;

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
      ...base,
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(first.removed).toEqual([upper]);
    expect(first.kept).toEqual([lower]);
  });

  test('the same command again finds none under its own spelling and removes the other', () => {
    const second = selectUninstall([lower], {
      ...base,
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
      ...base,
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
      ...base,
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(run.removed).toEqual([upper]);
    expect(run.kept).toEqual([other, local]);
  });

  test('with no record left the selection says the plugin is not installed in that scope', () => {
    const run = selectUninstall([], {
      ...base,
      scope: 'project',
      projectPath: '/w/a',
      platform: 'windows',
    });
    expect(run.removed).toEqual([]);
    expect(run.orphaned).toEqual([]);
    expect(run.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Plugin "formatter@acme" is not installed in project scope',
      }),
    ]);
  });

  test('records of another folder only leave the same message, and remove nothing', () => {
    const other = record('C:\\work\\other');
    const run = selectUninstall([other], {
      ...base,
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(run.removed).toEqual([]);
    expect(run.kept).toEqual([other]);
    expect(run.issues.map((one) => one.message)).toEqual([
      'Plugin "formatter@acme" is not installed in project scope',
    ]);
  });

  test('a removal says nothing', () => {
    const run = selectUninstall([upper], {
      ...base,
      scope: 'project',
      projectPath: 'C:\\work\\app',
      platform: 'windows',
    });
    expect(run.issues).toEqual([]);
  });

  test('a project or local uninstall that names no folder removes no record of any project', () => {
    const records = [record('C:\\work\\a'), record('C:\\work\\b'), record('/w/c', 'local')];
    for (const scope of ['project', 'local'] as const) {
      const run = selectUninstall(records, { ...base, scope, platform: 'windows' });
      expect(run.removed).toEqual([]);
      expect(run.kept).toEqual(records);
      expect(run.orphaned).toEqual([]);
      expect(run.issues).toHaveLength(1);
      expect(run.issues[0]?.message).toContain(`${scope} scope`);
    }
  });
});

spec('install.loading.Cleanup of previous versions', () => {
  const copied: InstallRecord = {
    scope: 'user',
    installPath: '/p/cache/acme/formatter/1.0.0',
    version: '1.0.0',
  };
  const inPlace: InstallRecord = {
    scope: 'user',
    installPath: '/m/plugins/formatter',
    version: '1',
  };

  test('uninstalling a copied plugin leaves its version folder behind to be marked', () => {
    const run = selectUninstall([copied], { ...base, scope: 'user', platform: 'posix' });
    expect(run.removed).toEqual([copied]);
    expect(run.orphaned).toEqual(['/p/cache/acme/formatter/1.0.0']);
  });

  test('uninstalling a plugin loaded in place marks nothing: its folder is the user own source directory', () => {
    const run = selectUninstall([inPlace], { ...base, scope: 'user', platform: 'posix' });
    expect(run.removed).toEqual([inPlace]);
    expect(run.orphaned).toEqual([]);
  });

  test('a version folder another scope still uses is not marked', () => {
    const project: InstallRecord = { ...copied, scope: 'project', projectPath: '/w/a' };
    const run = selectUninstall([copied, project], { ...base, scope: 'user', platform: 'posix' });
    expect(run.removed).toEqual([copied]);
    expect(run.orphaned).toEqual([]);
  });
});

describe('judgments', () => {
  test('off Windows only the same text names the same folder', () => {
    const other = record('/Work/App');
    const run = selectUninstall([other], {
      ...base,
      scope: 'project',
      projectPath: '/work/app',
      platform: 'posix',
    });
    expect(run.removed).toEqual([]);
  });

  test('user scope has no folder: its records are the scope', () => {
    const user: InstallRecord = { scope: 'user', installPath: '/c', version: '1' };
    const run = selectUninstall([user, upper], { ...base, scope: 'user', platform: 'windows' });
    expect(run.removed).toEqual([user]);
    expect(run.kept).toEqual([upper]);
  });
});
