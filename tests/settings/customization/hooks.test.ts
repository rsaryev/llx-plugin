/**
 * settings-reference.md § `strictPluginOnlyCustomization.hooks` ("Stops running: hooks from user,
 * project, and local `settings.json`; frontmatter hooks in skills, custom commands, and agents, from
 * the sources that a `skills` or `agents` lock would block. Keeps running: hooks in managed settings,
 * and hooks from plugins other than skills-directory plugins"; "Skills, custom commands, and agents
 * whose frontmatter hooks stop running still load while their own surface isn't locked"; "A personal
 * or project skill that declares `hooks` in its frontmatter also loses its `allowed-tools`
 * pre-approval ... When such a skill runs in a subagent through `context: fork`, it keeps the
 * pre-approval. A skill that declares no `hooks` keeps its pre-approval too"), hooks.md § Limits on
 * skill hooks ("A skill keeps its frontmatter hooks under that lock only if it's a plugin skill, a
 * bundled skill, or a skill in the managed settings directory"), skills.md § When managed settings
 * lock hooks to plugins.
 */
import { describe, expect, test } from 'bun:test';
import { PLUGIN_ONLY_SURFACES } from '../../../src/protocol/settings-keys.ts';
import { customizationOf, locking } from '../../support/customization.ts';
import {
  fromFrontmatter,
  fromManaged,
  fromPlugin,
  fromPluginFrontmatter,
  fromSdk,
  fromSettings,
  hookPolicyOf,
  runs,
} from '../../support/hook-policy.ts';
import { spec } from '../../support/spec.ts';

const locked = customizationOf(locking(['hooks']));
const open = customizationOf([]);
const PLUGIN = 'formatter@acme-tools' as const;
const OWNERS = ['skill', 'command', 'agent'] as const;

spec('settings.key.strictPluginOnlyCustomization.hooks', () => {
  describe('what stops running', () => {
    test.each(['user', 'project', 'local'] as const)('hooks from %s settings.json', (scope) => {
      expect(locked.loads('hooks', fromSettings(scope))).toBe(false);
    });

    test.each(OWNERS)(
      "frontmatter hooks of a %s from the user's, the project's or an added directory",
      (owner) => {
        for (const from of ['user', 'project', 'addDir'] as const) {
          expect(locked.loads('hooks', fromFrontmatter(owner, from))).toBe(false);
        }
      },
    );

    test('frontmatter hooks of a skill synced from claude.ai: the sources a skills lock blocks', () => {
      expect(locked.loads('hooks', fromFrontmatter('skill', 'synced'))).toBe(false);
    });

    test("hooks of a skills-directory plugin, and its skills' frontmatter hooks", () => {
      const folder = { skillsDirPlugin: true };
      expect(locked.loads('hooks', fromPlugin(PLUGIN, folder))).toBe(false);
      for (const owner of OWNERS) {
        expect(locked.loads('hooks', fromPluginFrontmatter(owner, PLUGIN, folder))).toBe(false);
      }
    });
  });

  describe('what keeps running', () => {
    test('hooks in managed settings', () => {
      expect(locked.loads('hooks', fromManaged)).toBe(true);
    });

    test('hooks from plugins other than skills-directory plugins, frontmatter hooks of their skills included', () => {
      expect(locked.loads('hooks', fromPlugin(PLUGIN))).toBe(true);
      for (const owner of OWNERS) {
        expect(locked.loads('hooks', fromPluginFrontmatter(owner, PLUGIN))).toBe(true);
      }
    });

    test('frontmatter hooks of a bundled skill and of a skill in the managed settings directory', () => {
      for (const owner of OWNERS) {
        expect(locked.loads('hooks', fromFrontmatter(owner, 'bundled'))).toBe(true);
        expect(locked.loads('hooks', fromFrontmatter(owner, 'managed'))).toBe(true);
      }
    });

    test('SDK hook callbacks are not settings hooks and are never stopped', () => {
      expect(locked.loads('hooks', fromSdk)).toBe(true);
    });
  });

  describe('without the hooks lock', () => {
    test('nothing locked: every source loads', () => {
      for (const origin of [
        fromSettings('user'),
        fromSettings('project'),
        fromFrontmatter('skill', 'user'),
        fromPlugin(PLUGIN),
      ]) {
        expect(open.loads('hooks', origin)).toBe(true);
      }
    });

    test.each(PLUGIN_ONLY_SURFACES.filter((surface) => surface !== 'hooks'))(
      'locking only %s leaves settings and frontmatter hooks running',
      (surface) => {
        const policy = customizationOf(locking([surface]));
        expect(policy.loads('hooks', fromSettings('user'))).toBe(true);
        expect(policy.loads('hooks', fromFrontmatter('skill', 'project'))).toBe(true);
      },
    );

    test('locking only skills stops the skills-directory plugin whole, hooks included', () => {
      const skillsOnly = customizationOf(locking(['skills']));
      expect(skillsOnly.loads('hooks', fromPlugin(PLUGIN, { skillsDirPlugin: true }))).toBe(false);
      expect(skillsOnly.loads('hooks', fromPlugin(PLUGIN))).toBe(true);
    });
  });

  describe('the hook policy reads the same lock', () => {
    test('a hook the lock stops is one the hook policy refuses, with the lock as the reason', () => {
      const sources = locking(['hooks']);
      const policy = hookPolicyOf(sources, { locks: { hooks: locked.locked.has('hooks') } });
      expect(runs(policy, fromSettings('user'))).toBe(false);
      expect(policy.runs(fromSettings('user'))).toEqual({
        run: false,
        reason: 'strictPluginOnlyCustomization.hooks',
      });
      expect(runs(policy, fromManaged)).toBe(true);
    });
  });

  describe('allowed-tools pre-approval', () => {
    const declaring = { declaresHooks: true, contextFork: false } as const;

    test.each(['user', 'project'] as const)(
      'a %s skill that declares hooks loses it under the hooks lock',
      (source) => {
        expect(locked.skillAllowedToolsPreapproved({ source, ...declaring })).toBe(false);
      },
    );

    test.each(['user', 'project'] as const)(
      'a %s skill that declares hooks keeps it when it runs in a subagent through context: fork',
      (source) => {
        const forked = { source, declaresHooks: true, contextFork: true } as const;
        expect(locked.skillAllowedToolsPreapproved(forked)).toBe(true);
      },
    );

    test.each(['user', 'project'] as const)(
      'a %s skill that declares no hooks keeps it',
      (source) => {
        const plain = { source, declaresHooks: false, contextFork: false } as const;
        expect(locked.skillAllowedToolsPreapproved(plain)).toBe(true);
      },
    );

    test.each(['plugin', 'bundled', 'managed'] as const)(
      'a %s skill keeps its frontmatter hooks, so it keeps the pre-approval',
      (source) => {
        expect(locked.skillAllowedToolsPreapproved({ source, ...declaring })).toBe(true);
      },
    );

    test('without the hooks lock every skill keeps it, also when only skills are locked', () => {
      const skillsOnly = customizationOf(locking(['skills', 'agents', 'mcp']));
      for (const policy of [open, skillsOnly]) {
        expect(policy.skillAllowedToolsPreapproved({ source: 'user', ...declaring })).toBe(true);
        expect(policy.skillAllowedToolsPreapproved({ source: 'project', ...declaring })).toBe(true);
      }
    });
  });
});
