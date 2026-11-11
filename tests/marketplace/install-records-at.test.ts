/**
 * plugins/install.md § Choose an install scope and plugins/overview.md § Understand install scopes:
 * a user-scope plugin is "enabled for you in every project on this machine", a project- or
 * local-scope one in "this repository" only; plugins/cli-reference.md (`plugin list --json`):
 * `projectPath` is the "Project the install belongs to. `project` and `local` scope only". Which
 * install records of `installed_plugins.json` apply in one project folder. Judgment
 * (spec/judgments.md): a managed record applies everywhere, like a user one; a project or local
 * record without `projectPath` belongs to no folder; folders compare as `selectUninstall` compares them.
 */
import { describe, expect, test } from 'bun:test';
import { installsAt } from '../../src/marketplace/install-records-at.ts';
import type { InstallRecord } from '../../src/marketplace/installed-plugins.ts';
import { spec } from '../support/spec.ts';

const record = (scope: InstallRecord['scope'], projectPath?: string): InstallRecord => ({
  scope,
  installPath: `/cache/m/p/${scope}`,
  version: '1.0.0',
  ...(projectPath === undefined ? {} : { projectPath }),
});

const RECORDS = {
  'p@m': [record('user'), record('project', '/work/app'), record('local', '/work/other')],
  'q@m': [record('local', '/work/app')],
  'r@m': [record('project', '/work/other')],
};

spec(
  [
    'install.guide.Choose an install scope.User scope',
    'install.guide.Choose an install scope.Project scope',
    'install.guide.Choose an install scope.Local scope',
    'install.overview.Understand install scopes.User scope',
    'install.overview.Understand install scopes.Project scope',
    'install.overview.Understand install scopes.Local scope',
  ],
  () => {
    test('user records apply in every project; project and local ones in their own folder only', () => {
      expect(installsAt(RECORDS, { projectPath: '/work/app', platform: 'posix' })).toEqual({
        'p@m': [record('user'), record('project', '/work/app')],
        'q@m': [record('local', '/work/app')],
      });
    });

    test('outside any project only the user records apply', () => {
      expect(installsAt(RECORDS, { platform: 'posix' })).toEqual({ 'p@m': [record('user')] });
    });
  },
);

describe('installsAt (judgment)', () => {
  test('a managed record applies everywhere', () => {
    const managed = { 'm@m': [record('managed')] };
    expect(installsAt(managed, { projectPath: '/x', platform: 'posix' })).toEqual(managed);
  });

  test('a project record without projectPath belongs to no folder', () => {
    expect(
      installsAt({ 'p@m': [record('project')] }, { projectPath: '/x', platform: 'posix' }),
    ).toEqual({});
  });

  test('folders compare by the platform: on Windows capitals and separators do not tell them apart', () => {
    const records = { 'p@m': [record('local', 'c:\\work\\app')] };
    expect(installsAt(records, { projectPath: 'C:/work/app/', platform: 'windows' })).toEqual(
      records,
    );
    expect(installsAt(records, { projectPath: 'C:/work/app', platform: 'posix' })).toEqual({});
  });
});
