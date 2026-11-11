/**
 * settings-reference.md § `disableAllHooks` ("Only managed settings can disable managed hooks";
 * "The reach depends on which file carries the key": managed settings disable every configured hook,
 * including managed ones, and keep the Agent SDK's in-process hooks; any other file disables user,
 * project, local, and plugin hooks while managed hooks, Agent SDK hooks, and hooks from plugins
 * force-enabled in managed `enabledPlugins` keep running; the key also stops mods, built-in mods
 * excepted; "The `/goal` command can't run while hooks are disabled"), § "Status line and file
 * suggestion gates" (off entirely under managed `disableAllHooks`; narrowed to managed settings when
 * it is `true` outside managed settings after settings precedence), hooks.md § "Disable or remove
 * hooks" ("Claude Code reads the value left after settings precedence applies, so a
 * `"disableAllHooks": false` in a project's `.claude/settings.json` overrides a `true` in your user
 * settings"; `--settings '{"disableAllHooks": true}'` "takes precedence over project and local
 * settings"; "`disableAllHooks` set in user, project, or local settings can't disable those managed
 * hooks"), managed-settings.md § "Keys that fail closed" ("An invalid `disableAllHooks`, even a
 * quoted Boolean, is dropped with a warning"), plugins/mods/admin.md § "Choose how much to allow",
 * plugins/mods/troubleshoot.md § "Refusal messages" (`only managed plugins and built-in plugins run`).
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, plain } from '../../support/settings-layers.ts';
import {
  flag,
  forceEnable,
  fromFrontmatter,
  fromManaged,
  fromPlugin,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  local,
  managed,
  project,
  runs,
  user,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const off = { disableAllHooks: true };
const on = { disableAllHooks: false };
const ids = ['user', 'project', 'local'] as const;

spec(['settings.key.disableAllHooks', 'hooks.behavior.Disable or remove hooks'], () => {
  describe('the value left after settings precedence', () => {
    test('unset: hooks run from every origin', () => {
      const policy = hookPolicyOf([user({})]);
      for (const scope of ids) expect(runs(policy, fromSettings(scope))).toBe(true);
      expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
      expect(policy.goalCommandAvailable).toBe(true);
    });

    test('true in user settings turns user, project, local and plugin hooks off', () => {
      const policy = hookPolicyOf([user(off)]);
      for (const scope of ids) {
        expect(plain(policy.runs(fromSettings(scope)))).toEqual({
          run: false,
          reason: 'disableAllHooks',
        });
      }
      expect(runs(policy, fromPlugin('lint@team'))).toBe(false);
    });

    test('false in the project file overrides a true in user settings', () => {
      const policy = hookPolicyOf([user(off), project(on)]);
      expect(runs(policy, fromSettings('project'))).toBe(true);
      expect(runs(policy, fromSettings('user'))).toBe(true);
      expect(runs(policy, fromPlugin('lint@team'))).toBe(true);
    });

    test('a true in the project file overrides a false in user settings', () => {
      const policy = hookPolicyOf([user(on), project(off)]);
      expect(runs(policy, fromSettings('user'))).toBe(false);
    });

    test('--settings true takes precedence over project and local settings', () => {
      const policy = hookPolicyOf([project(on), local(on), flag(off)]);
      for (const scope of ids) expect(runs(policy, fromSettings(scope))).toBe(false);
    });

    test('local settings beat the shared project file', () => {
      expect(runs(hookPolicyOf([project(off), local(on)]), fromSettings('project'))).toBe(true);
      expect(runs(hookPolicyOf([project(on), local(off)]), fromSettings('project'))).toBe(false);
    });

    test('false means the hooks run', () => {
      const policy = hookPolicyOf([user(on)]);
      for (const scope of ids) expect(runs(policy, fromSettings(scope))).toBe(true);
      expect(policy.goalCommandAvailable).toBe(true);
    });
  });

  describe('true in managed settings', () => {
    const policy = hookPolicyOf([managed(off), forceEnable('vetted@acme')]);

    test('disables every configured hook, managed ones included', () => {
      expect(plain(policy.runs(fromManaged))).toEqual({ run: false, reason: 'disableAllHooks' });
      for (const scope of ids) expect(runs(policy, fromSettings(scope))).toBe(false);
      expect(runs(policy, fromPlugin('vetted@acme'))).toBe(false);
      expect(runs(policy, fromPlugin('lint@team'))).toBe(false);
    });

    test('keeps the hooks the Agent SDK registers in process', () => {
      expect(plain(policy.runs(fromSdk))).toEqual({ run: true });
    });

    test('frontmatter hooks stop whatever their source', () => {
      for (const from of ['user', 'project', 'addDir', 'synced', 'managed', 'bundled'] as const) {
        expect(runs(policy, fromFrontmatter('agent', from))).toBe(false);
      }
    });

    test('a managed false is the value left and keeps hooks running over a user true', () => {
      const lifted = hookPolicyOf([managed(on), user(off)]);
      expect(runs(lifted, fromManaged)).toBe(true);
      expect(runs(lifted, fromSettings('user'))).toBe(true);
    });

    test('turns off the mods in every installed plugin, the organization own included', () => {
      const orgMod = fromPlugin('guard@acme', { isMod: true, isOrgMod: true });
      const userMod = fromPlugin('theme@team', { isMod: true });
      expect(runs(policy, orgMod)).toBe(false);
      expect(runs(policy, userMod)).toBe(false);
    });

    test('does not stop mods built into Claude Code', () => {
      const builtin = fromPlugin('cc-plugin-agents-md@builtin', { isMod: true });
      expect(runs(policy, builtin)).toBe(true);
    });
  });

  describe('true in any other settings file', () => {
    for (const [name, source] of [
      ['user', user(off)],
      ['project', project(off)],
      ['local', local(off)],
      ['--settings', flag(off)],
    ] as const) {
      test(`${name}: managed hooks, SDK hooks and force-enabled plugin hooks keep running`, () => {
        const policy = hookPolicyOf([source, forceEnable('vetted@acme')]);
        expect(runs(policy, fromManaged)).toBe(true);
        expect(runs(policy, fromSdk)).toBe(true);
        expect(runs(policy, fromPlugin('vetted@acme'))).toBe(true);
      });
    }

    test('user, project, local and plugin hooks stop, and so do frontmatter hooks of those sources', () => {
      const policy = hookPolicyOf([project(off), forceEnable('vetted@acme')]);
      for (const scope of ids) expect(runs(policy, fromSettings(scope))).toBe(false);
      expect(runs(policy, fromPlugin('lint@team'))).toBe(false);
      expect(runs(policy, fromFrontmatter('agent', 'project'))).toBe(false);
      expect(runs(policy, fromFrontmatter('skill', 'user'))).toBe(false);
    });

    test('hooks of the --settings file and of the SDK settings option stop too, whichever file carries the key', () => {
      for (const source of [user(off), project(off), local(off), flag(off)]) {
        const policy = hookPolicyOf([source]);
        expect(plain(policy.runs(fromSettings('flag')))).toEqual({
          run: false,
          reason: 'disableAllHooks',
        });
        expect(runs(policy, fromSettings('sdkSettingsOption'))).toBe(false);
      }
    });

    test('the --settings and SDK settings hooks run when the value left after precedence is false', () => {
      const policy = hookPolicyOf([user(off), flag(on)]);
      expect(runs(policy, fromSettings('flag'))).toBe(true);
      expect(runs(policy, fromSettings('sdkSettingsOption'))).toBe(true);
    });

    test('a plugin is force-enabled by its full plugin@marketplace id', () => {
      const policy = hookPolicyOf([user(off), forceEnable('vetted@acme')]);
      expect(runs(policy, fromPlugin('vetted@acme'))).toBe(true);
      expect(runs(policy, fromPlugin('vetted@elsewhere'))).toBe(false);
    });

    test('a plugin enabled only by the user is not force-enabled', () => {
      const policy = hookPolicyOf([user({ ...off, enabledPlugins: { 'mine@team': true } })]);
      expect(runs(policy, fromPlugin('mine@team'))).toBe(false);
    });

    test('mods the user installed stop and the organization mods keep running', () => {
      const policy = hookPolicyOf([user(off), forceEnable('guard@acme', 'theme@team')]);
      expect(runs(policy, fromPlugin('guard@acme', { isMod: true, isOrgMod: true }))).toBe(true);
      expect(runs(policy, fromPlugin('theme@team', { isMod: true }))).toBe(false);
    });

    test('mods built into Claude Code keep running', () => {
      const policy = hookPolicyOf([user(off)]);
      const builtin = fromPlugin('cc-plugin-telemetry@builtin', { isMod: true });
      expect(runs(policy, builtin)).toBe(true);
    });
  });

  describe('a user, project or local file cannot disable managed hooks', () => {
    for (const [name, source] of [
      ['user', user(off)],
      ['project', project(off)],
      ['local', local(off)],
    ] as const) {
      test(name, () => {
        expect(runs(hookPolicyOf([managed({}), source]), fromManaged)).toBe(true);
      });
    }
  });

  describe('the custom status line and file suggestion command', () => {
    test('managed true turns them off entirely', () => {
      const policy = hookPolicyOf([managed(off)]);
      expect(policy.commandsDisabled.statusLine).toBe(true);
      expect(policy.commandsDisabled.fileSuggestion).toBe(true);
      expect(policy.commandsDisabled.subagentStatusLine).toBe(true);
    });

    test('true outside managed settings narrows them to managed settings instead', () => {
      const policy = hookPolicyOf([user(off)]);
      expect(policy.commandsDisabled.statusLine).toBe(false);
      expect(policy.commandsDisabled.fileSuggestion).toBe(false);
      expect(policy.commandSettingsNarrowedToManaged).toBe(true);
    });

    test('a project false overriding a user true leaves them running', () => {
      const policy = hookPolicyOf([user(off), project(on)]);
      expect(policy.commandsDisabled.statusLine).toBe(false);
      expect(policy.commandSettingsNarrowedToManaged).toBe(false);
    });

    test('an untrusted folder turns them off entirely', () => {
      const policy = hookPolicyOf([user({})], { context: { folderTrusted: false } });
      expect(policy.commandsDisabled.statusLine).toBe(true);
      expect(policy.commandsDisabled.fileSuggestion).toBe(true);
    });

    test('unset: not off and not narrowed', () => {
      const policy = hookPolicyOf([user({})]);
      expect(policy.commandsDisabled.statusLine).toBe(false);
      expect(policy.commandSettingsNarrowedToManaged).toBe(false);
    });
  });

  describe('/goal', () => {
    test('is unavailable while hooks are disabled, from managed settings or any other file', () => {
      expect(hookPolicyOf([managed(off)]).goalCommandAvailable).toBe(false);
      expect(hookPolicyOf([user(off)]).goalCommandAvailable).toBe(false);
      expect(hookPolicyOf([local(off)]).goalCommandAvailable).toBe(false);
    });

    test('follows the value left after precedence', () => {
      expect(hookPolicyOf([user(off), project(on)]).goalCommandAvailable).toBe(true);
    });

    test('is unavailable in a folder that is not trusted, as hooks in settings files are not', () => {
      const policy = hookPolicyOf([user({})], { context: { folderTrusted: false } });
      expect(policy.goalCommandAvailable).toBe(false);
    });
  });

  describe('an invalid value in managed settings', () => {
    test('even a quoted Boolean is dropped with a warning and disables nothing', () => {
      const raw = { disableAllHooks: 'true' };
      expect(issuesOf('managed', raw).map((issue) => issue.severity)).toEqual(['warning']);
      const policy = hookPolicyOf([managed(raw)]);
      expect(runs(policy, fromManaged)).toBe(true);
      expect(policy.goalCommandAvailable).toBe(true);
    });

    test('a number is dropped the same way', () => {
      expect(runs(hookPolicyOf([managed({ disableAllHooks: 1 })]), fromManaged)).toBe(true);
    });
  });
});
