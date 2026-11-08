/**
 * skills.md § Pre-approve tools for a skill, through `expandSkill`: "When managed settings lock
 * hooks to plugins" (`strictPluginOnlyCustomization` lists `hooks`: a personal or project skill
 * that declares hooks loses its `allowed-tools` pre-approval, apart from the skills that keep it)
 * and "When only managed permission rules apply" (`allowManagedPermissionRulesOnly`: Claude Code
 * ignores `allowed-tools` in project and personal skills and in the other sources the setting's
 * entry lists).
 */
import { expect, test } from 'bun:test';
import type { SkillPluginSource } from '../../src/skills/expand-policy.ts';
import { abortOf, expandWith, grantsOf, PLUGIN, skillFrom } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const commit = 'allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)';

spec('skills.behavior.When only managed permission rules apply', () => {
  test('"allowManagedPermissionRulesOnly": the grant of a project or personal skill does not apply', async () => {
    const request = { policy: { managedPermissionRulesOnly: true } };
    for (const origin of [{ kind: 'project' }, { kind: 'user' }] as const) {
      const skill = skillFrom(commit, '!`git status`', origin);
      const run = await expandWith(skill, { request });
      expect(grantsOf(await expandWith(skillFrom(commit, 'x', origin), { request }))).toEqual([]);
      expect(abortOf(run.expansion)).toContain('permission check failed');
    }
  });

  test('a synced skill\'s grant "doesn\'t apply" under the same setting, and applies otherwise', async () => {
    const synced = skillFrom(commit, 'x', { kind: 'synced' });
    expect(grantsOf(await expandWith(synced))).toHaveLength(3);
    const managed = await expandWith(synced, {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(grantsOf(managed)).toEqual([]);
  });

  test('a plugin skill from an installed plugin keeps its grant under that setting', async () => {
    const skill = skillFrom(commit, 'x', PLUGIN);
    const run = await expandWith(skill, {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(grantsOf(run)).toHaveLength(3);
  });

  test('"Skills from managed settings ... keep their allowed-tools": a managed-origin skill keeps its 3 grants', async () => {
    const run = await expandWith(skillFrom(commit, 'x', { kind: 'managed' }), {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(grantsOf(run)).toHaveLength(3);
    expect(run.expansion).toMatchObject({ ok: true, ignoredGrants: [] });
  });

  test('the same setting ignores `allowed-tools` of a skills-directory plugin and of an `@inline` plugin in a managed Desktop session', async () => {
    const policy = { managedPermissionRulesOnly: true };
    const skill = skillFrom(commit, 'x', PLUGIN);
    const dropped: readonly SkillPluginSource[] = ['skills-directory', 'inline-managed-session'];
    for (const pluginSource of dropped) {
      const run = await expandWith(skill, { request: { policy, session: { pluginSource } } });
      expect(grantsOf(run)).toEqual([]);
    }
    const installed = await expandWith(skill, {
      request: { policy, session: { pluginSource: 'installed' } },
    });
    expect(grantsOf(installed)).toHaveLength(3);
  });

  test('the plugin source matters only under the setting', async () => {
    const run = await expandWith(skillFrom(commit, 'x', PLUGIN), {
      request: { session: { pluginSource: 'skills-directory' } },
    });
    expect(grantsOf(run)).toHaveLength(3);
  });
  test("the fork exception is the hooks lock's: `allowManagedPermissionRulesOnly` still ignores the field in a forked skill", async () => {
    const run = await expandWith(skillFrom(`${commit}\ncontext: fork`, 'x'), {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(grantsOf(run)).toEqual([]);
  });

  test('"Run /status to list each skill whose allowed-tools Claude Code has ignored": the expansion reports the rules it withheld', async () => {
    const policy = { managedPermissionRulesOnly: true };
    const ignored = await expandWith(skillFrom(commit, 'x'), { request: { policy } });
    expect(ignored.expansion).toMatchObject({
      ok: true,
      grants: [],
      ignoredGrants: ['Bash(git add *)', 'Bash(git commit *)', 'Bash(git status *)'],
    });
    const kept = await expandWith(skillFrom(commit, 'x', PLUGIN), { request: { policy } });
    expect(kept.expansion).toMatchObject({ ok: true, ignoredGrants: [] });
    const unset = await expandWith(skillFrom(commit, 'x'));
    expect(unset.expansion).toMatchObject({ ok: true, ignoredGrants: [] });
  });

  test('"The tools an affected skill lists go through your organization\'s managed rules and the normal permission prompt instead": a command no managed rule allows aborts', async () => {
    const policy = { managedPermissionRulesOnly: true };
    const skill = skillFrom(commit, '!`git status`');
    const asking = await expandWith(skill, { request: { policy } });
    expect(abortOf(asking.expansion)).toContain('permission check failed');
    const allowedByManaged = await expandWith(skill, {
      request: { policy },
      rules: { allow: ['Bash(git status *)'] },
      replies: [{ stdout: 'clean' }],
    });
    expect(allowedByManaged.expansion.ok).toBe(true);
  });
});

spec('skills.behavior.When managed settings lock hooks to plugins', () => {
  test('"strictPluginOnlyCustomization" locking hooks: a personal or project skill that declares hooks loses its grant', async () => {
    const hooks =
      'hooks:\n  PreToolUse:\n    - matcher: Bash\n      hooks:\n        - type: command\n          command: ./check.sh';
    const request = { policy: { hooksLockedToPlugins: true } };
    for (const origin of [{ kind: 'project' }, { kind: 'user' }] as const) {
      expect(
        grantsOf(await expandWith(skillFrom(`${commit}\n${hooks}`, 'x', origin), { request })),
      ).toEqual([]);
    }
    const plain = await expandWith(skillFrom(commit, 'x'), { request });
    expect(grantsOf(plain)).toHaveLength(3);
    const plugin = await expandWith(skillFrom(`${commit}\n${hooks}`, 'x', PLUGIN), { request });
    expect(grantsOf(plugin)).toHaveLength(3);
  });

  test('a skill from the managed settings directory keeps its hooks and its grant under the lock', async () => {
    const hooks =
      'hooks:\n  PreToolUse:\n    - matcher: Bash\n      hooks:\n        - type: command\n          command: ./check.sh';
    const run = await expandWith(skillFrom(`${commit}\n${hooks}`, 'x', { kind: 'managed' }), {
      request: { policy: { hooksLockedToPlugins: true } },
    });
    expect(grantsOf(run)).toHaveLength(3);
    expect(run.expansion).toMatchObject({ ok: true, hooks: { PreToolUse: [{ matcher: 'Bash' }] } });
  });

  test('"When such a skill runs in a subagent through `context: fork`, it keeps the pre-approval"', async () => {
    const hooks =
      'hooks:\n  PreToolUse:\n    - matcher: Bash\n      hooks:\n        - type: command\n          command: ./check.sh';
    const request = { policy: { hooksLockedToPlugins: true } };
    for (const origin of [{ kind: 'project' }, { kind: 'user' }] as const) {
      const run = await expandWith(skillFrom(`${commit}\ncontext: fork\n${hooks}`, 'x', origin), {
        request,
      });
      expect(grantsOf(run)).toHaveLength(3);
      expect('hooks' in run.expansion).toBe(false);
    }
  });
});
