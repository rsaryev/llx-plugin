/**
 * settings.md § Settings files and who they affect (the table), § Compare the scope of each settings
 * file (the acme-app scenario: your machine, a teammate's, a cloud session), § Find or create your
 * settings files, § Keep personal settings out of a repository (the global git excludes file),
 * § Where Claude Code keeps the local file in a git repository, § Use the /config menu.
 */
import { describe, expect, test } from 'bun:test';
import {
  FILE_ORIGINS,
  LOCAL_FILE_IGNORE_ENTRY,
  WRITE_TARGET,
  configDirOf,
  globalGitExcludesFile,
  localSettingsFiles,
  localSettingsRoot,
  projectSettingsFile,
  reachOf,
  shouldAddGitExclude,
  userSettingsFile,
  type FileFacts,
  type LocalPlacementFacts,
} from '../../../src/settings/general/index.ts';
import { createGeneralView } from '../../support/settings-general.ts';
import { layerOf } from '../../support/settings-layers.ts';
import { spec } from '../../support/spec.ts';

const joinPath = (base: string, relativePath: string): string => `${base}/${relativePath}`;
const facts = (configDirEnv?: string): FileFacts => ({
  homeDir: '/home/me',
  configDirEnv,
  projectDir: '/work/acme-app',
  joinPath,
});

const COMPARE = 'settingsMerge.settings.Compare the scope of each settings file';

spec(`${COMPARE}.~/.claude/settings.json`, () => {
  describe('every project on your machine, and nothing on your teammate or in the cloud session', () => {
    test('the user file reaches all your projects only', () => {
      for (const committed of [true, false]) {
        expect(reachOf('user', { committed, serverManaged: false })).toEqual({
          yourMachine: 'every project',
          teammate: false,
          cloudSession: false,
        });
      }
    });
  });
});

spec(`${COMPARE}.acme-app/.claude/settings.json`, () => {
  describe('your acme-app, and a teammate or a cloud session only if you commit the file', () => {
    test('uncommitted, the file is on your disk like any other and nobody else has it', () => {
      expect(reachOf('project', { committed: false, serverManaged: false })).toEqual({
        yourMachine: 'this project',
        teammate: false,
        cloudSession: false,
      });
    });

    test('committed, it reaches the teammate clone and the cloud session', () => {
      expect(reachOf('project', { committed: true, serverManaged: false })).toEqual({
        yourMachine: 'this project',
        teammate: true,
        cloudSession: true,
      });
    });
  });
});

spec(`${COMPARE}.acme-app/.claude/settings.local.json`, () => {
  describe('your acme-app only, and Claude Code keeps it out of your commits', () => {
    test('the local file reaches your project only, committed or not', () => {
      for (const committed of [true, false]) {
        expect(reachOf('local', { committed, serverManaged: false })).toEqual({
          yourMachine: 'this project',
          teammate: false,
          cloudSession: false,
        });
      }
    });

    test('the first write adds **/.claude/settings.local.json to the global git excludes, only when Claude Code writes and nothing ignores it yet', () => {
      expect(LOCAL_FILE_IGNORE_ENTRY).toBe('**/.claude/settings.local.json');
      const write = { inGitRepository: true, alreadyIgnored: false, claudeCodeWrites: true };
      expect(shouldAddGitExclude(write)).toBe(true);
      expect(shouldAddGitExclude({ ...write, alreadyIgnored: true })).toBe(false);
      expect(shouldAddGitExclude({ ...write, inGitRepository: false })).toBe(false);
    });

    test('a file you created by hand that Claude Code has not written is yours to ignore in .gitignore', () => {
      expect(
        shouldAddGitExclude({
          inGitRepository: true,
          alreadyIgnored: false,
          claudeCodeWrites: false,
        }),
      ).toBe(false);
    });

    test('the excludes file is core.excludesFile when it is absolute or ~-prefixed, else $XDG_CONFIG_HOME/git/ignore, else ~/.config/git/ignore', () => {
      const git = {
        homeDir: '/home/me',
        joinPath,
        xdgConfigHome: undefined,
        coreExcludesFile: undefined,
      };
      expect(globalGitExcludesFile({ ...git, coreExcludesFile: '/etc/gitignore-global' })).toBe(
        '/etc/gitignore-global',
      );
      expect(globalGitExcludesFile({ ...git, coreExcludesFile: '~/.gitignore_global' })).toBe(
        '/home/me/.gitignore_global',
      );
      expect(
        globalGitExcludesFile({
          ...git,
          coreExcludesFile: 'relative/ignore',
          xdgConfigHome: '/xdg',
        }),
      ).toBe('/xdg/git/ignore');
      expect(globalGitExcludesFile({ ...git, xdgConfigHome: '/xdg' })).toBe('/xdg/git/ignore');
      expect(globalGitExcludesFile(git)).toBe('/home/me/.config/git/ignore');
    });
  });
});

spec(`${COMPARE}.Managed settings`, () => {
  describe('every project on every machine the organization deploys it to; only server-managed settings reach the cloud session', () => {
    test('a managed file or MDM policy reaches machines but not the cloud session', () => {
      expect(reachOf('managed', { committed: false, serverManaged: false })).toEqual({
        yourMachine: 'every project',
        teammate: true,
        cloudSession: false,
      });
    });

    test('server-managed settings from the claude.ai console reach the cloud session too', () => {
      expect(reachOf('managed', { committed: false, serverManaged: true }).cloudSession).toBe(true);
    });
  });
});

const inRepository = (over: Partial<LocalPlacementFacts> = {}): LocalPlacementFacts => ({
  homeDir: '/home/me',
  windows: false,
  repository: { root: '/work/acme', ownedByUser: true },
  ...over,
});

const FIND = 'settingsMerge.settings.Find or create your settings files';

spec(`${FIND}.Managed`, () => {
  describe('your organization deploys it; you do not create or edit it', () => {
    test('it is not yours to edit: no folder fact names a managed file, and it is read from every project', () => {
      expect(FILE_ORIGINS.managed.youEdit).toBe(false);
      expect(
        localSettingsFiles({ ...inRepository(), projectDir: '/work/acme', joinPath }),
      ).not.toContain(FILE_ORIGINS.managed.documentedPath);
      expect(reachOf('managed', { committed: false, serverManaged: false }).yourMachine).toBe(
        'every project',
      );
    });
  });
});

spec(`${FIND}.Shared project`, () => {
  describe('a project may have one committed; if not, create it at .claude/settings.json in the project folder', () => {
    test('the file is .claude/settings.json in the project folder, apart from the local file beside it', () => {
      expect(projectSettingsFile(facts())).toBe('/work/acme-app/.claude/settings.json');
      expect(
        localSettingsFiles({ ...inRepository(), projectDir: '/work/acme', joinPath }),
      ).not.toContain(projectSettingsFile({ ...facts(), projectDir: '/work/acme' }));
    });
  });
});

spec(`${FIND}.User`, () => {
  describe('create it yourself, or let Claude Code create it: ~/.claude/settings.json, or CLAUDE_CONFIG_DIR', () => {
    test('the file is in ~/.claude, or under CLAUDE_CONFIG_DIR when that is set', () => {
      expect(userSettingsFile(facts())).toBe('/home/me/.claude/settings.json');
      expect(configDirOf(facts())).toBe('/home/me/.claude');
      expect(userSettingsFile(facts('/data/claude'))).toBe('/data/claude/settings.json');
      expect(userSettingsFile(facts(''))).toBe('/home/me/.claude/settings.json');
    });

    test('Claude Code writes it for a /config option stored in user settings and for a /model default, and the local file for a standing approval or a few /config options', () => {
      // The type of `WRITE_TARGET` lets a trigger name only these two files, so a managed or a
      // shared project file is never written; here are the two the docs name.
      expect(WRITE_TARGET['config-option']).toBe('user');
      expect(WRITE_TARGET['model-default']).toBe('user');
      expect(WRITE_TARGET['permission-standing-approval']).toBe('local');
      expect(WRITE_TARGET['config-option-kept-local']).toBe('local');
    });
  });
});

spec('settingsMerge.settings.Where Claude Code keeps the local file in a git repository', () => {
  describe('at the repository root, with four documented exceptions', () => {
    test('started in a subdirectory, the file is at the repository root and applies across the repository', () => {
      expect(localSettingsRoot(inRepository())).toBe('/work/acme');
      expect(
        localSettingsFiles({ ...inRepository(), projectDir: '/work/acme/packages/app', joinPath }),
      ).toEqual([
        '/work/acme/.claude/settings.local.json',
        '/work/acme/packages/app/.claude/settings.local.json',
      ]);
    });

    test('it stays with .claude/settings.json outside a repository, at a home-directory root, on Windows, and when the root is not owned by you', () => {
      const own = ['/work/acme/packages/app/.claude/settings.local.json'];
      const place = (over: Partial<LocalPlacementFacts>) =>
        localSettingsFiles({
          ...inRepository(over),
          projectDir: '/work/acme/packages/app',
          joinPath,
        });
      expect(localSettingsRoot(inRepository({ repository: undefined }))).toBeUndefined();
      expect(place({ repository: undefined })).toEqual(own);
      expect(place({ repository: { root: '/home/me', ownedByUser: true } })).toEqual(own);
      expect(place({ windows: true })).toEqual(own);
      expect(place({ repository: { root: '/work/acme', ownedByUser: false } })).toEqual(own);
    });

    test('where the root file and the earlier one set the same key the root value applies, and the permission rules of both apply', () => {
      // The files come in the order `localSettingsFiles` gives: the root's first.
      const view = createGeneralView([
        layerOf('local', { model: 'opus', permissions: { allow: ['Bash(make)'] } }),
        layerOf('local', { model: 'haiku', permissions: { allow: ['Bash(ls)'] } }),
      ]);
      expect(view.get('model')).toBe('opus');
      expect(view.get('permissions')?.allow).toEqual(['Bash(make)', 'Bash(ls)']);
    });

    test('started at the root there is one file; the file an earlier version left in a subdirectory is still read after the root one', () => {
      expect(localSettingsFiles({ ...inRepository(), projectDir: '/work/acme', joinPath })).toEqual(
        ['/work/acme/.claude/settings.local.json'],
      );
    });
  });
});
