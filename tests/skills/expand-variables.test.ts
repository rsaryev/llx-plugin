/**
 * `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` in injected commands and in `allowed-tools`
 * (skills.md § Available string substitutions) and the `disableSkillShellExecution` setting
 * (skills.md § Inject dynamic context; settings-reference.md § disableSkillShellExecution), through
 * `expandSkill`.
 */
import { expect, test } from 'bun:test';
import { expandWith, grantsOf, PLUGIN, skillFrom, textOf } from '../support/expand.ts';
import { spec } from '../support/spec.ts';

const RENDER = '!`${CLAUDE_SKILL_DIR}/scripts/render.sh data.csv`';
const SKILL_DIR = '/work/app/.claude/skills/render-chart';
const GH_RULE = 'allowed-tools: Bash(gh *)';

spec('skills.substitution.${CLAUDE_SKILL_DIR}', () => {
  test("in an injected command it names the skill's folder, so bundled scripts run from anywhere", async () => {
    const skill = skillFrom('', RENDER, { kind: 'project' }, 'render-chart');
    const run = await expandWith(skill, {
      permissions: () => 'allow',
      request: { cwd: '/somewhere/else' },
    });
    expect(run.runs[0]).toMatchObject({
      spec: { command: `${SKILL_DIR}/scripts/render.sh data.csv` },
      cwd: '/somewhere/else',
    });
  });

  test("for a plugin skill it is the skill's subfolder, not the plugin root", async () => {
    const skill = skillFrom('', RENDER, PLUGIN, 'render-chart');
    const run = await expandWith(skill, { permissions: () => 'allow' });
    expect(run.runs[0]?.spec).toMatchObject({
      command: '/plugins/my-plugin/skills/render-chart/scripts/render.sh data.csv',
    });
  });

  test('in the body text and the grant alike', async () => {
    const skill = skillFrom(
      'allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)',
      'Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>`.',
      { kind: 'project' },
      'render-chart',
    );
    const run = await expandWith(skill);
    expect(run.expansion).toMatchObject({
      text: `Run \`${SKILL_DIR}/scripts/render.sh <csv-file>\`.`,
      grants: [`Bash(${SKILL_DIR}/scripts/render.sh *)`],
    });
  });
});

spec('skills.substitution.${CLAUDE_PLUGIN_ROOT}', () => {
  const SHARED = 'Lint: !`${CLAUDE_PLUGIN_ROOT}/shared/lint.sh`';

  test("in a plugin skill's injected command it is the plugin folder", async () => {
    const run = await expandWith(skillFrom('', SHARED, PLUGIN), {
      permissions: () => 'allow',
      replies: [{ stdout: 'ok' }],
    });
    expect(run.runs[0]?.spec).toMatchObject({ command: '/plugins/my-plugin/shared/lint.sh' });
    expect(textOf(run.expansion)).toBe('Lint: ok');
  });

  test('the same variable in `allowed-tools` lets the script run without prompting', async () => {
    const skill = skillFrom('allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/shared/*)', SHARED, PLUGIN);
    const run = await expandWith(skill, { replies: [{ stdout: 'ok' }] });
    expect(textOf(run.expansion)).toBe('Lint: ok');
    expect(grantsOf(run)).toEqual(['Bash(/plugins/my-plugin/shared/*)']);
  });

  test('"Substituted only in plugin skills": a project skill\'s command runs with it as written', async () => {
    const run = await expandWith(skillFrom('', SHARED), { permissions: () => 'allow' });
    expect(run.runs[0]?.spec).toMatchObject({ command: '${CLAUDE_PLUGIN_ROOT}/shared/lint.sh' });
  });
});

spec('settings.key.disableSkillShellExecution', () => {
  const PLACEHOLDER = '[shell command execution disabled by policy]';
  const body = 'A: !`gh pr diff`\n```!\nnode --version\n```\nB: !`gh pr view`';
  const disabled = { disableShellExecution: true };

  test('"Each command is replaced with `[shell command execution disabled by policy]` instead of being run"', async () => {
    const run = await expandWith(skillFrom(GH_RULE, body), { request: disabled });
    expect(textOf(run.expansion)).toBe(`A: ${PLACEHOLDER}\n${PLACEHOLDER}\nB: ${PLACEHOLDER}`);
    expect(run.runs).toHaveLength(0);
  });

  test('no permission check happens for a command that is not run', async () => {
    const run = await expandWith(skillFrom('', body), { request: disabled });
    expect(run.asked).toHaveLength(0);
    expect(run.expansion.ok).toBe(true);
  });

  test('it covers skills from user, project and plugin sources', async () => {
    for (const origin of [{ kind: 'user' }, { kind: 'project' }, PLUGIN] as const) {
      const run = await expandWith(skillFrom('', 'A: !`ls`', origin), { request: disabled });
      expect(textOf(run.expansion)).toBe(`A: ${PLACEHOLDER}`);
      expect(run.runs).toHaveLength(0);
    }
  });

  test('a skill needing no shell does not fail for want of one when commands are disabled', async () => {
    const run = await expandWith(skillFrom('shell: bash', 'A: !`ls`'), {
      request: { ...disabled, shells: { bash: false, powershell: false } },
    });
    expect(textOf(run.expansion)).toBe(`A: ${PLACEHOLDER}`);
  });

  test('off, the same skill runs its commands', async () => {
    const run = await expandWith(skillFrom('', 'A: !`ls`'), {
      permissions: () => 'allow',
      replies: [{ stdout: 'a.ts' }],
    });
    expect(textOf(run.expansion)).toBe('A: a.ts');
  });
});
