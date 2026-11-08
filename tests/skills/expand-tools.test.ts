/**
 * What the frontmatter fields do once a skill is expanded, end to end through `expandSkill`:
 * skills.md § Frontmatter reference (allowed-tools, disallowed-tools, hooks, shell, model, effort,
 * context), § Pre-approve tools for a skill, § Available string substitutions (`${CLAUDE_SKILL_DIR}`
 * and `${CLAUDE_PLUGIN_ROOT}` in the content and in the Bash rules of `allowed-tools`), § Inject
 * dynamic context (`disableSkillShellExecution`), § How injected commands run, § Permission checks
 * on injected commands; hooks.md § Hooks in skills and agents; settings-reference.md §
 * disableSkillShellExecution. The readers of the same fields are tested in tests/format.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/skills/expand-policy.ts';
import { abortOf, expandWith, grantsOf, PLUGIN, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const RENDER = '!`${CLAUDE_SKILL_DIR}/scripts/render.sh data.csv`';
const SKILL_DIR = '/work/app/.claude/skills/render-chart';

spec('skills.frontmatter.allowed-tools', () => {
  const commit = 'allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)';

  test('the docs example: three Bash rules are the grants of the invocation', async () => {
    const run = await expandWith(skillFrom(commit, 'Commit.'));
    expect(grantsOf(run)).toEqual(['Bash(git add *)', 'Bash(git commit *)', 'Bash(git status *)']);
  });

  test('a space- or comma-separated string and a YAML list give the same grants', async () => {
    for (const field of [
      'allowed-tools: Read, Grep',
      'allowed-tools: Read Grep',
      'allowed-tools:\n  - Read\n  - Grep',
    ]) {
      expect(grantsOf(await expandWith(skillFrom(field, 'x')))).toEqual(['Read', 'Grep']);
    }
  });

  test('without the field there is no grant', async () => {
    expect(grantsOf(await expandWith(skillFrom('', 'x')))).toEqual([]);
  });

  test('the grants let an injected command run without prompting', async () => {
    const skill = skillFrom(commit, 'Status: !`git status --short`');
    const { expansion, runs } = await expandWith(skill, { replies: [{ stdout: 'clean' }] });
    expect(textOf(expansion)).toBe('Status: clean');
    expect(runs).toHaveLength(1);
  });

  test('"It does not restrict which tools are available": a command it does not list still follows the permission rules', async () => {
    const skill = skillFrom(commit, '!`git push origin main`');
    const { expansion, runs } = await expandWith(skill, { rules: { allow: ['Bash(git push *)'] } });
    expect(textOf(expansion)).toBe('');
    expect(runs).toHaveLength(1);
    const unlisted = await expandWith(skill);
    expect(abortOf(unlisted.expansion)).toContain('Shell command permission check failed');
  });

  test('"Deny and ask rules still override `allowed-tools`"', async () => {
    const skill = skillFrom(commit, '!`git commit -m x`');
    const denied = await expandWith(skill, { rules: { deny: ['Bash(git commit *)'] } });
    expect(abortOf(denied.expansion)).toContain('permission check failed');
    expect(denied.runs).toHaveLength(0);
    const asked = await expandWith(skill, { rules: { ask: ['Bash(git commit *)'] } });
    expect(abortOf(asked.expansion)).toContain('permission check failed');
  });

  test('the docs pattern: the same `${CLAUDE_SKILL_DIR}` in the rule and the body runs the script without prompting', async () => {
    const skill = skillFrom(
      'allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)',
      `Chart: ${RENDER}`,
      { kind: 'project' },
      'render-chart',
    );
    const run = await expandWith(skill, { replies: [{ stdout: 'chart.png' }] });
    expect(textOf(run.expansion)).toBe('Chart: chart.png');
    expect(run.runs[0]?.spec).toMatchObject({ command: `${SKILL_DIR}/scripts/render.sh data.csv` });
    expect(grantsOf(run)).toEqual([`Bash(${SKILL_DIR}/scripts/render.sh *)`]);
  });

  test('without the substitution in the rule the script would prompt (so the rule must be substituted)', async () => {
    const skill = skillFrom(
      'allowed-tools: Bash(/other/scripts/render.sh *)',
      `Chart: ${RENDER}`,
      { kind: 'project' },
      'render-chart',
    );
    expect(abortOf((await expandWith(skill)).expansion)).toContain('permission check failed');
  });

  test('a rule that is not a Bash rule is kept as written', async () => {
    const skill = skillFrom('allowed-tools: Read(${CLAUDE_SKILL_DIR}/*) Edit', 'x');
    expect(grantsOf(await expandWith(skill))).toEqual(['Read(${CLAUDE_SKILL_DIR}/*)', 'Edit']);
  });

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

  test('the same setting ignores `allowed-tools` of a skills-directory plugin and of an `@inline` plugin in a managed Desktop session', async () => {
    const policy = { managedPermissionRulesOnly: true };
    const skill = skillFrom(commit, 'x', PLUGIN);
    const dropped: readonly PluginSource[] = ['skills-directory', 'inline-managed-session'];
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

  test("the fork exception is the hooks lock's: `allowManagedPermissionRulesOnly` still ignores the field in a forked skill", async () => {
    const run = await expandWith(skillFrom(`${commit}\ncontext: fork`, 'x'), {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(grantsOf(run)).toEqual([]);
  });
});

spec('skills.frontmatter.disallowed-tools', () => {
  test('the tools are removed from the pool for the invocation: they come back as `disallowed`', async () => {
    const run = await expandWith(skillFrom('disallowed-tools: AskUserQuestion', 'Loop.'));
    expect(run.expansion).toMatchObject({ ok: true, disallowed: ['AskUserQuestion'], grants: [] });
  });

  test('a space- or comma-separated string and a YAML list give the same tools', async () => {
    for (const field of [
      'disallowed-tools: AskUserQuestion, Bash(rm *)',
      'disallowed-tools:\n  - AskUserQuestion\n  - Bash(rm *)',
    ]) {
      const run = await expandWith(skillFrom(field, 'x'));
      expect(run.expansion).toMatchObject({ disallowed: ['AskUserQuestion', 'Bash(rm *)'] });
    }
  });

  test('without the field nothing is removed, and the field never grants anything', async () => {
    expect((await expandWith(skillFrom('', 'x'))).expansion).toMatchObject({ disallowed: [] });
    const both = await expandWith(skillFrom('allowed-tools: Read\ndisallowed-tools: Edit', 'x'));
    expect(both.expansion).toMatchObject({ grants: ['Read'], disallowed: ['Edit'] });
  });

  test('"A skill\'s `disallowed-tools` still applies" under `allowManagedPermissionRulesOnly`, while its grant does not', async () => {
    const run = await expandWith(skillFrom('allowed-tools: Read\ndisallowed-tools: Edit', 'x'), {
      request: { policy: { managedPermissionRulesOnly: true } },
    });
    expect(run.expansion).toMatchObject({ grants: [], disallowed: ['Edit'] });
  });
});

const lockedFor = (pluginSource: PluginSource) => ({
  policy: { hooksLockedToPlugins: true },
  session: { pluginSource },
});

describe('hooks', () => {
  const HOOKS = `hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"`;
  const declared = {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/security-check.sh' }] },
    ],
  };

  spec('skills.frontmatter.hooks', () => {
    test('"registers when the skill is invoked": the expansion carries the declared hooks, in the official shape', async () => {
      const run = await expandWith(skillFrom(HOOKS, 'Secure.'));
      expect(run.expansion).toMatchObject({ ok: true, hooks: declared });
    });

    test('a skill without hooks registers none', async () => {
      const run = await expandWith(skillFrom('', 'x'));
      if (!run.expansion.ok) throw new Error('unreachable');
      expect('hooks' in run.expansion).toBe(false);
    });

    test('`once: true` is carried through for the host to remove the hook after its first successful run', async () => {
      const once = HOOKS.replace('type: command', 'type: command\n          once: true');
      const run = await expandWith(skillFrom(once, 'x'));
      expect(run.expansion).toMatchObject({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: './scripts/security-check.sh', once: true }],
            },
          ],
        },
      });
    });

    test('hooks of a skills-directory plugin stop under the lock, those of any other plugin keep running', async () => {
      const dropped = await expandWith(skillFrom(HOOKS, 'x', PLUGIN), {
        request: lockedFor('skills-directory'),
      });
      if (!dropped.expansion.ok) throw new Error('unreachable');
      expect('hooks' in dropped.expansion).toBe(false);
      for (const source of ['installed', 'inline-managed-session'] as const) {
        const kept = await expandWith(skillFrom(HOOKS, 'x', PLUGIN), {
          request: lockedFor(source),
        });
        expect(kept.expansion).toMatchObject({ hooks: declared });
      }
    });

    test('hooks locked to plugins (`strictPluginOnlyCustomization`): a personal or project skill registers none, a plugin skill keeps them', async () => {
      const request = { policy: { hooksLockedToPlugins: true } };
      for (const origin of [{ kind: 'project' }, { kind: 'user' }] as const) {
        const run = await expandWith(skillFrom(HOOKS, 'x', origin), { request });
        if (!run.expansion.ok) throw new Error('unreachable');
        expect('hooks' in run.expansion).toBe(false);
      }
      const plugin = await expandWith(skillFrom(HOOKS, 'x', PLUGIN), { request });
      expect(plugin.expansion).toMatchObject({ hooks: declared });
    });
  });
});

describe("judgments: the tool pool is the host's", () => {
  test("`disallowed` is the field as written, `EndConversation` included: whether it can be removed while another tool remains is the host's", async () => {
    const run = await expandWith(skillFrom('disallowed-tools: EndConversation Edit', 'x'));
    expect(run.expansion).toMatchObject({ disallowed: ['EndConversation', 'Edit'] });
  });
});
