/**
 * plugins/install.md § Choose an install scope (user, project and local scope: which settings file
 * records the plugin and who gets it; local overrides project overrides user), § Install from your
 * shell (`install` defaults to user scope; `--scope project` or `local` change it), § Manage plugins
 * from your shell (`enable` and `disable` act on the most specific scope whose settings already list
 * the plugin; `install` and `uninstall` act on user scope); plugins/overview.md § Understand install
 * scopes; plugins/loading.md § Enabled in project settings but not installed (a collaborator still
 * installs a project-scope plugin on their own machine).
 *
 * A scope is a name only: that a cloud session "doesn't load the plugins in your local settings"
 * (overview.md) is a matter of which settings a session reads, which the settings stream owns, and
 * `defaultEnabled: false` ("installed but stays off") is the install plan's, in tests/cli/install-dependencies.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import {
  collaboratorInstallCommand,
  defaultScope,
  mostSpecificScope,
  scopeReach,
  SCOPES_BY_PRECEDENCE,
} from '../../src/marketplace/install-scopes.ts';
import { spec } from '../support/spec.ts';

const SCOPE = 'install.guide.Choose an install scope';
const OVERVIEW = 'install.overview.Understand install scopes';

spec([`${SCOPE}.User scope`, `${OVERVIEW}.User scope`], () => {
  test('is enabled for you in every project on this machine, recorded in ~/.claude/settings.json', () => {
    expect(scopeReach('user')).toEqual({
      file: '~/.claude/settings.json',
      audience: 'you',
      reach: 'every-project',
      committed: false,
      collaboratorsInstall: false,
    });
  });
});

spec([`${SCOPE}.Project scope`, `${OVERVIEW}.Project scope`], () => {
  test('is enabled for everyone who works in the repository, recorded in the committed .claude/settings.json', () => {
    expect(scopeReach('project')).toEqual({
      file: '.claude/settings.json',
      audience: 'everyone-in-repository',
      reach: 'this-repository',
      committed: true,
      collaboratorsInstall: true,
    });
  });

  test('committing the entry does not download the plugin: each collaborator runs one install command', () => {
    expect(collaboratorInstallCommand('formatter@your-org')).toBe(
      'claude plugin install formatter@your-org --scope project',
    );
  });
});

spec([`${SCOPE}.Local scope`, `${OVERVIEW}.Local scope`], () => {
  test('is enabled for you in this repository only, recorded in .claude/settings.local.json', () => {
    expect(scopeReach('local')).toEqual({
      file: '.claude/settings.local.json',
      audience: 'you',
      reach: 'this-repository',
      committed: false,
      collaboratorsInstall: false,
    });
  });
});

describe('how the three scopes relate (install.md, "Choose an install scope")', () => {
  const chosen = ['user', 'project', 'local'] as const;

  test('each scope has its own settings file', () => {
    expect(new Set(chosen.map((scope) => scopeReach(scope).file)).size).toBe(3);
  });

  test('only the project file is committed, and only for it does each collaborator install', () => {
    expect(chosen.filter((scope) => scopeReach(scope).committed)).toEqual(['project']);
    expect(chosen.filter((scope) => scopeReach(scope).collaboratorsInstall)).toEqual(['project']);
  });

  test('the file under the home directory reaches every project; the two beside the repository only this one', () => {
    for (const scope of chosen) {
      const { file, reach } = scopeReach(scope);
      expect(reach).toBe(file.startsWith('~/') ? 'every-project' : 'this-repository');
    }
  });

  test('the local file is the project file with `.local` before the extension, so it is not committed with it', () => {
    expect(scopeReach('local').file).toBe(
      scopeReach('project').file.replace('.json', '.local.json'),
    );
  });

  test('the scopes that are only for you are the ones nobody else receives', () => {
    expect(chosen.filter((scope) => scopeReach(scope).audience === 'you')).toEqual([
      'user',
      'local',
    ]);
  });
});

describe('the same plugin at several scopes (install.md, "Choose an install scope")', () => {
  test('local overrides project, and project overrides user', () => {
    expect(SCOPES_BY_PRECEDENCE).toEqual(['managed', 'local', 'project', 'user']);
    expect(mostSpecificScope(['user', 'project', 'local'])).toBe('local');
    expect(mostSpecificScope(['user', 'project'])).toBe('project');
    expect(mostSpecificScope(['user'])).toBe('user');
    expect(mostSpecificScope([])).toBeUndefined();
  });

  test('a scope no settings file holds is never most specific', () => {
    expect(mostSpecificScope(['managed'])).toBeUndefined();
  });
});

spec('install.guide.Install from your shell.Scope', () => {
  test('install is user scope unless --scope names another', () => {
    expect(defaultScope('install', [])).toBe('user');
    expect(defaultScope('install', ['project', 'local'])).toBe('user');
  });
});

spec('install.guide.Manage plugins from your shell', () => {
  test('enable and disable act on the most specific scope whose settings already list the plugin', () => {
    expect(defaultScope('enable', ['user', 'project'])).toBe('project');
    expect(defaultScope('disable', ['user', 'project', 'local'])).toBe('local');
    expect(defaultScope('disable', ['user'])).toBe('user');
  });

  test('install and uninstall act on user scope', () => {
    expect(defaultScope('uninstall', ['project', 'local'])).toBe('user');
  });

  test('enable or disable of a plugin no settings file lists has no scope to act on', () => {
    expect(defaultScope('enable', [])).toBeUndefined();
  });
});
