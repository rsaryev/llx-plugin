/**
 * permissions.md § "Where output styles, hooks, and local settings load from" ("Claude Code discovers
 * output styles from the current working directory and its parents, your user directory at
 * `~/.claude/`, and managed settings. Hooks and other `.claude/settings.json` keys load from the
 * current working directory's `.claude/` folder with no parent-directory fallback, alongside your user
 * `~/.claude/settings.json` and managed settings. `.claude/settings.local.json` loads from the git
 * repository root instead ... except where Claude Code doesn't use the repository root, such as on
 * Windows"; the three ways to share configuration: user-level files, plugins, launching from the
 * config directory); settings.md § "Where Claude Code keeps the local file in a git repository"
 * (outside a git repository, a root that is the home directory, Windows, or a root not owned by the
 * user), § "Find or create your settings files" (`CLAUDE_CONFIG_DIR`); plugins/components.md, "Output
 * styles" and "Hooks".
 */
import { describe, expect, test } from 'bun:test';
import { settingsLocations, type SettingsLocationsInput } from '../../../src/settings/index.ts';
import { loaded } from '../../support/host.ts';
import { hooksFile } from '../../support/plugin-folder.ts';
import { spec } from '../../support/spec.ts';

const join = (base: string, relative: string): string => `${base}/${relative}`;

/** A session started in `directory` of a repository at `/work/app`, on a POSIX host, home `/home/alice`. */
const base = (directory: string): SettingsLocationsInput => ({
  primaryWorkingDirectory: directory,
  home: '/home/alice',
  directories: ancestors(directory),
  repositoryRoot: '/work/app',
  windows: false,
  join,
});

const session = (directory: string, overrides: Partial<SettingsLocationsInput> = {}) =>
  settingsLocations({ ...base(directory), ...overrides });

/** The same session outside any git repository. */
const outsideGit = (directory: string) => {
  const { repositoryRoot: _root, ...rest } = base(directory);
  return settingsLocations(rest);
};

/** The directory and each parent, nearest first. */
function ancestors(directory: string): string[] {
  const parts = directory.split('/').filter(Boolean);
  return parts.map((_, index) => `/${parts.slice(0, parts.length - index).join('/')}`).concat('/');
}

spec(
  'permissions.behavior.Where output styles, hooks, and local settings load from.Launch from the config directory',
  () => {
    test('started in the directory that holds .claude/, the project settings and hooks load from it', () => {
      expect(session('/work/app').project).toBe('/work/app/.claude/settings.json');
    });

    test("started in a subdirectory, the project settings are that directory's: there is no parent-directory fallback", () => {
      const inside = session('/work/app/packages/web');
      expect(inside.project).toBe('/work/app/packages/web/.claude/settings.json');
      expect(inside.project).not.toBe(session('/work/app').project);
    });

    test('output styles, unlike hooks, are discovered from the working directory and its parents', () => {
      const inside = session('/work/app/packages/web');
      expect(inside.outputStyles.slice(0, 4)).toEqual([
        '/work/app/packages/web/.claude/output-styles',
        '/work/app/packages/.claude/output-styles',
        '/work/app/.claude/output-styles',
        '/work/.claude/output-styles',
      ]);
    });

    test('settings.local.json loads from the repository root even when started in a subdirectory', () => {
      expect(session('/work/app/packages/web').local).toBe('/work/app/.claude/settings.local.json');
    });

    test('it stays with .claude/settings.json outside a git repository, with the home directory as the root, on Windows, or for a root another user owns', () => {
      const here = '/work/app/packages/web/.claude/settings.local.json';
      expect(outsideGit('/work/app/packages/web').local).toBe(here);
      expect(session('/work/app/packages/web', { repositoryRoot: '/home/alice' }).local).toBe(here);
      expect(session('/work/app/packages/web', { windows: true }).local).toBe(here);
      expect(session('/work/app/packages/web', { repositoryNotOwned: true }).local).toBe(here);
    });
  },
);

spec(
  'permissions.behavior.Where output styles, hooks, and local settings load from.User-level configuration',
  () => {
    test('~/.claude/settings.json and ~/.claude/output-styles apply in every project', () => {
      for (const directory of ['/work/app', '/srv/other/project', '/tmp/scratch']) {
        const locations = outsideGit(directory);
        expect(locations.user).toBe('/home/alice/.claude/settings.json');
        expect(locations.outputStyles.at(-1)).toBe('/home/alice/.claude/output-styles');
      }
    });

    test('CLAUDE_CONFIG_DIR moves the user directory', () => {
      const locations = session('/work/app', { configDirectory: '/data/claude' });
      expect(locations.user).toBe('/data/claude/settings.json');
      expect(locations.outputStyles.at(-1)).toBe('/data/claude/output-styles');
    });
  },
);

describe('plugins carry configuration to every project', () => {
  spec(
    'permissions.behavior.Where output styles, hooks, and local settings load from.Plugins',
    () => {
      test('a plugin packages output styles and hooks that load wherever it is installed', async () => {
        const plugin = await loaded({
          '.claude-plugin/plugin.json': JSON.stringify({ name: 'team-config' }),
          'output-styles/terse.md': '---\ndescription: Short answers\n---\nBe brief.\n',
          'hooks/hooks.json': hooksFile('./scripts/format.sh'),
        });
        expect(plugin.outputStyles.map((style) => style.name)).toEqual(['terse']);
        expect(Object.keys(plugin.hooks ?? {})).toEqual(['PostToolUse']);
      });
    },
  );
});
